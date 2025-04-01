const { app, BrowserWindow, ipcMain } = require('electron'); // Import ipcMain
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai'); // Require the SDK here
require('dotenv').config(); // Load environment variables from .env file

// --- Google Generative AI Setup (Main Process) ---
// WARNING: Storing API keys directly in code is insecure!
// Use environment variables (process.env.GOOGLE_API_KEY) or a secure config method.
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY; // <-- API key now from environment variable
let visionModel = null;

if (GOOGLE_API_KEY && GOOGLE_API_KEY.startsWith("AIza")) {
    try {
        const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
        // Add generationConfig for temperature
        visionModel = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                temperature: 1.0 // Increased temperature to maximum for more randomness
            }
        });
        console.log("Google Generative AI SDK initialized in main process with temperature 1.0.");
    } catch (e) {
         console.error("Error initializing Google Generative AI in main process:", e);
         // Handle initialization error (e.g., disable feature)
    }
} else {
    console.warn("Google API Key not provided or invalid in main process. AI interpretation feature disabled.");
}

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000, // Increased width
    height: 1200, // Increased height
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Consider using a preload script later for security
      contextIsolation: true, // Recommended for security
      nodeIntegration: false // Recommended for security
    }
  });

  // Load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools();
}

// --- Helper function to check for too many full lines ---
function hasTooManyFullLines(pixels, rows, cols, difficulty) {
    // This check now operates on pixels *after* white ones have been filtered out.
    if (!pixels || pixels.length === 0) return false; // No pixels, no full lines

    const grid = Array(rows).fill(null).map(() => Array(cols).fill(0));
    pixels.forEach(([r, c]) => {
        // Ensure coordinates are within bounds before assigning
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
            grid[r][c] = 1; // Mark as filled (non-white)
        } else {
             console.warn(`hasTooManyFullLines check: Skipping out-of-bounds pixel [${r}, ${c}]`);
        }
    });

    let fullRowCount = 0;
    for (let r = 0; r < rows; r++) {
        // Check if grid[r] exists before calling every()
        if (grid[r] && grid[r].every(cell => cell === 1)) {
            fullRowCount++;
        }
    }

    let fullColCount = 0;
    for (let c = 0; c < cols; c++) {
        let isColFull = true;
        for (let r = 0; r < rows; r++) {
            // Check if grid[r] exists and access grid[r][c] safely
            if (!grid[r] || grid[r][c] === 0) {
                isColFull = false;
                break;
            }
        }
        if (isColFull) {
            fullColCount++;
        }
    }

    let rowLimitPercentage = 0.20; // Default 20% limit
    let colLimitPercentage = 0.20; // Default 20% limit

    if (difficulty === 2) {
        rowLimitPercentage = 0.30; // 30% for difficulty 2
        colLimitPercentage = 0.30; // 30% for difficulty 2
    } else if (difficulty === 1) {
        rowLimitPercentage = 0.40; // 40% for difficulty 1
        colLimitPercentage = 0.40; // 40% for difficulty 1
    }

    // Calculate limits based on percentage of rows/cols, rounding up
    const rowLimit = Math.ceil(rows * rowLimitPercentage);
    const colLimit = Math.ceil(cols * colLimitPercentage);

    if (fullRowCount > rowLimit || fullColCount > colLimit) {
        console.warn(`Validation failed: Found ${fullRowCount} full rows (limit ${rowLimit}) and ${fullColCount} full columns (limit ${colLimit}).`);
        return true;
    }

    return false;
}


// --- Helper function to parse AI response ---
function parseAIResponse(responseText) {
    console.log(`Attempting to parse AI Response (length: ${responseText.length})`);

    // Extract JSON part using regex - find the last occurrence of a JSON array structure
    const jsonMatch = responseText.match(/(\[[\s\S]*\])[^\]]*$/);
    if (!jsonMatch || !jsonMatch[1]) {
        console.error(`Failed to find JSON in response: ${responseText}`);
        throw new Error("AI response did not contain a recognizable JSON array of pixels at the end.");
    }
    let pixelsText = jsonMatch[1];
    // console.log(`Extracted JSON Text:`, pixelsText); // Log potentially large string

    // Extract description: Everything before the matched JSON block
    const descriptionText = responseText.substring(0, jsonMatch.index).trim();
    console.log(`Extracted Description:`, descriptionText);

    // Remove JS-style comments before parsing
    pixelsText = pixelsText.replace(/\/\/[^\n\r]*[\n\r]?/g, '');
    // console.log(`JSON after comment removal:`, pixelsText); // Log potentially large string

    // Basic cleanup for JSON - remove potential markdown backticks around it
    pixelsText = pixelsText.replace(/^```json\s*|```$/g, '').trim();
    // console.log(`JSON after backtick removal:`, pixelsText); // Log potentially large string

    try {
        let filledPixels = JSON.parse(pixelsText);

        // Validate the structure
        if (!Array.isArray(filledPixels) || (filledPixels.length > 0 && !filledPixels.every(pixel => Array.isArray(pixel) && pixel.length === 3 && typeof pixel[0] === 'number' && typeof pixel[1] === 'number' && typeof pixel[2] === 'string' && pixel[2].match(/^#[0-9a-fA-F]{6}$/i)))) {
            // Log the problematic part if possible
            const invalidItem = filledPixels.find(pixel => !(Array.isArray(pixel) && pixel.length === 3 && typeof pixel[0] === 'number' && typeof pixel[1] === 'number' && typeof pixel[2] === 'string' && pixel[2].match(/^#[0-9a-fA-F]{6}$/i)));
            console.error(`Invalid JSON structure after parsing. Problematic item:`, invalidItem);
            throw new Error("Parsed JSON data is not a valid array of [row, col, hex_color] arrays.");
        }

        // **NEW**: Filter out white pixels (#FFFFFF, case-insensitive)
        const initialCount = filledPixels.length;
        filledPixels = filledPixels.filter(pixel => pixel[2].toUpperCase() !== '#FFFFFF');
        const removedCount = initialCount - filledPixels.length;
        if (removedCount > 0) {
            console.log(`Filtered out ${removedCount} white pixels.`);
        }

        console.log(`Successfully parsed description: "${descriptionText}"`);
        console.log(`Successfully parsed and filtered ${filledPixels.length} non-white filled pixels.`);

        return { description: descriptionText, pixels: filledPixels };

    } catch (jsonParseError) {
        console.error(`JSON Parse Error:`, jsonParseError);
        console.error(`Problematic JSON string (first 500 chars):`, pixelsText.substring(0, 500)); // Log only beginning
        throw jsonParseError; // Re-throw the error to be caught by the retry loop
    }
}


// --- IPC Handler for AI Interpretation and Coloring ---
ipcMain.handle('generate-pixel-art', async (event, rows, cols, fillPercentage, difficulty) => {
    if (!visionModel) {
        console.error("Generate pixel art request received, but vision model not initialized.");
        throw new Error("AI Vision Model not available in the main process.");
    }

    console.log(`Main process received generate-pixel-art request for ${rows}x${cols} grid with target fill ~${(fillPercentage * 100).toFixed(1)}%.`);

    const maxRetries = 5;
    let retryCount = 0;
    let lastError = null;

    // Expanded Kid-friendly and action-oriented lists
    const kidAdjectives = [
        "happy", "silly", "bouncy", "sparkly", "fluffy", "tiny", "brave", "sleepy", "colorful", "friendly",
        "fast", "shiny", "round", "grumpy", "giggly", "wobbly", "fuzzy", "bright", "gentle", "playful",
        "curious", "magic", "hidden", "lost", "found", "striped", "spotted", "dancing", "singing", "dreamy",
        "zany", "goofy", "jolly", "peaceful", "calm", "excited", "eager", "proud", "clever", "lucky",
        "chubby", "skinny", "tall", "short", "strong", "weak", "quiet", "loud", "smooth", "rough"
    ];
    const kidNouns = [
        "puppy", "kitten", "robot", "dinosaur", "teddy bear", "butterfly", "rocket", "castle", "flower", "star",
        "car", "train", "boat", "fish", "bird", "monster", "alien", "tree", "house", "rainbow",
        "unicorn", "dragon", "fairy", "gnome", "pirate", "superhero", "cupcake", "ice cream", "pizza", "balloon",
        "present", "cloud", "sun", "moon", "planet", "bug", "frog", "mouse", "duck", "pony",
        "bear", "lion", "tiger", "elephant", "monkey", "turtle", "snake", "spider", "worm", "ant",
        "ball", "kite", "drum", "guitar", "book", "pencil", "eraser", "crayon", "game", "puzzle"
    ];
    const kidActions = [
        "jumping", "flying", "dancing", "sleeping", "playing", "sparkling", "splashing", "rolling", "waving", "smiling",
        "running", "floating", "shining", "crumbling", "hopping", "wiggling", "glowing", "zooming", "spinning", "hiding",
        "sneaking", "munching", "building", "drawing", "reading", "singing", "climbing", "sliding", "swimming", "melting",
        "eating", "drinking", "thinking", "laughing", "crying", "whispering", "shouting", "kicking", "catching", "throwing",
        "hugging", "kissing", "writing", "painting", "coloring", "building", "digging", "planting", "watering", "fishing"
    ];


    while (retryCount < maxRetries) {
        retryCount++;
        console.log(`--- Starting generation attempt ${retryCount}/${maxRetries} ---`);
        try {
            const randomAdjective = kidAdjectives[Math.floor(Math.random() * kidAdjectives.length)];
            const randomNoun = kidNouns[Math.floor(Math.random() * kidNouns.length)];
            const randomAction = kidActions[Math.floor(Math.random() * kidActions.length)];

            // Updated prompt for kid-friendly, dynamic images with noise/scatter emphasis AND full line avoidance AND white background assumption
            const initialPrompt = `
Create a fun and colorful ${rows}x${cols} pixel art image suitable for a young child (around 7 years old).
The image should clearly show a ${randomAdjective} ${randomNoun} that is ${randomAction}.
Make it vibrant, easy to recognize, and visually appealing for a kid.
Crucially, include some visual effect related to the action (like sparkles, water splashes, speed lines, dust clouds, leaves falling, light rays, etc.).
Also, ensure some pixels (like background noise or effects) are scattered across the grid to minimize completely empty rows or columns. Distribute the pixels well for a good nonogram puzzle.
Use approximately ${fillPercentage * 100}% pixel fill for the main subject and its effects combined.
Avoid overly simple or abstract shapes like plain hearts, squares, or just letters. Be creative but keep the subject recognizable and kid-friendly!
**Assume the background is white. Only provide coordinates and colors for non-white pixels.**
**Also, please avoid making any row or column completely filled with pixels.**
Describe the image in one simple sentence that a child could understand (e.g., "A happy puppy jumping in puddles."). Do not start with "Pixel art of..." or "This is...". Just give the simple description.
Provide the filled pixels (non-white only) as a JSON array of arrays, with each inner array as [row, column, hex color code] (e.g., ["#RRGGBB"]). Ensure full 6-digit hex codes and valid JSON format.
Example JSON: [[0, 1, "#FF0000"], [1, 1, "#00FF00"], [2, 0, "#0000FF"]]
`;

            console.log(`AI Initial Prompt (attempt ${retryCount}):\n${initialPrompt}`);

            // --- First Attempt ---
            let result = await visionModel.generateContent(initialPrompt);
            let response = await result.response;
            let responseText = response.text();
            // console.log(`AI Raw Response (attempt ${retryCount} - initial):\n`, responseText); // Potentially very long

            // Parsing now includes filtering white pixels
            let parsedResult = parseAIResponse(responseText);
            let currentDescription = parsedResult.description;
            let currentPixels = parsedResult.pixels; // These are now guaranteed non-white

            // --- Validate: Too many full lines? ---
            // This check uses the non-white pixel data
            if (hasTooManyFullLines(currentPixels, rows, cols, difficulty)) {
                console.error(`Attempt ${retryCount} failed validation: Too many full lines.`);
                lastError = new Error("Generated image had too many full rows/columns.");
                continue; // Go to next retry iteration
            }

            // --- Check Fill Percentage ---
            // Calculation uses the count of non-white pixels
            const totalPixels = rows * cols;
            const actualFilledCount = currentPixels.length; // Count of non-white pixels
            const actualFillPercentage = actualFilledCount / totalPixels;
            const percentageDifference = Math.abs(actualFillPercentage - fillPercentage);

            console.log(`Target Fill: ${(fillPercentage * 100).toFixed(1)}%, Actual Non-White Fill: ${(actualFillPercentage * 100).toFixed(1)}%, Difference: ${(percentageDifference * 100).toFixed(1)}%`);

            // Allow 10% difference
            if (percentageDifference <= 0.10) {
                console.log(`Attempt ${retryCount} successful: Fill percentage (within 10%) and full line check OK.`);
                return { description: currentDescription, pixels: currentPixels }; // Return the good result
            }

            // --- Percentage Correction Needed ---
            console.warn(`Fill percentage difference (${(percentageDifference * 100).toFixed(1)}%) exceeds 10%. Attempting follow-up correction (within attempt ${retryCount}).`);

            const followUpPrompt = `
You previously generated an image described as: "${currentDescription}" for a ${rows}x${cols} grid.
The non-white pixel fill percentage was supposed to be around ${fillPercentage * 100}% but it was actually ${Math.round(actualFillPercentage * 100)}%.
Please adjust the image, keeping the same subject (${randomAdjective} ${randomNoun} ${randomAction}) and general appearance, but modify the number of **non-white** filled pixels (especially effects or background noise) to be closer to the target of ${fillPercentage * 100}%.
**Assume the background is white. Only provide coordinates and colors for non-white pixels.**
**Also ensure that no row or column is completely filled.**
Provide the updated simple description and the corrected JSON array of **non-white** pixels in the same format as before.
Example JSON: [[0, 1, "#FF0000"], [1, 1, "#00FF00"], [2, 0, "#0000FF"]]
`;
            console.log(`AI Follow-up Prompt (attempt ${retryCount}):\n${followUpPrompt}`);

            // --- Follow-up Attempt ---
            result = await visionModel.generateContent(followUpPrompt);
            response = await result.response;
            responseText = response.text();
            // console.log(`AI Raw Response (attempt ${retryCount} - follow-up):\n`, responseText); // Potentially long

            // Parsing follow-up also filters white pixels
            parsedResult = parseAIResponse(responseText);
            currentDescription = parsedResult.description; // Update with corrected data
            currentPixels = parsedResult.pixels; // These are now guaranteed non-white

            // --- Validate Follow-up: Too many full lines? ---
             if (hasTooManyFullLines(currentPixels, rows, cols, difficulty)) {
                console.error(`Attempt ${retryCount} (follow-up) failed validation: Too many full lines.`);
                lastError = new Error("Corrected image had too many full rows/columns.");
                continue; // Go to next retry iteration
            }

            // We won't re-check percentage strictly after follow-up to avoid loops,
            // but we have validated format and full lines.
            console.log(`Attempt ${retryCount} successful after follow-up correction.`);
            return { description: currentDescription, pixels: currentPixels };


        } catch (error) {
            lastError = error;
            console.error(`Error during AI generation attempt ${retryCount}:`, error.message);
            // Continue to the next retry iteration
        }
    }

    // If all retries failed, throw the last error
    console.error(`All ${maxRetries} retries failed for AI pixel art generation.`);
    throw new Error(`AI API Error after ${maxRetries} retries: ${lastError?.message || 'Unknown error during generation'}`);
});


app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
