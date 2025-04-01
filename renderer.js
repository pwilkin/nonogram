// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

// --- Google Generative AI Setup ---
// Removed from renderer. This is now handled in the main process.

console.log('Renderer process started');

// --- DOM Elements ---
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const difficultySlider = document.getElementById('difficulty');
const difficultyValueSpan = document.getElementById('difficulty-value');
const generateButton = document.getElementById('generate-board');
const gridContainer = document.getElementById('grid');
const colHintsContainer = document.getElementById('col-hints');
const rowHintsContainer = document.getElementById('row-hints');
const checkButton = document.getElementById('check-solution');
const highlightButton = document.getElementById('highlight-errors');
const showButton = document.getElementById('show-solution');
const interpretationResultDiv = document.getElementById('interpretation-result');
const gameContainer = document.getElementById('game-container');
const pixelArtDescriptionDiv = document.getElementById('pixel-art-description'); // Description div - now below game-container and controls
const interpretButton = document.getElementById('interpret-image'); // Added missing selector

// --- Game State ---
let currentBoard = null; // Will hold the generated solution
let playerBoard = null; // Will hold the player's current state
let rows = 10;
let cols = 10;
let difficulty = 3; // Default difficulty
let pixelArtDescription = ''; // To store the AI-generated description
let filledPixels = []; // To store the AI-generated filled pixels
let boardInteractionEnabled = true; // Track if board interaction is enabled

// --- Event Listeners ---
difficultySlider.addEventListener('input', (event) => {
    difficulty = parseInt(event.target.value, 10);
    difficultyValueSpan.textContent = difficulty;
});

generateButton.addEventListener('click', async () => {
    rows = parseInt(rowsInput.value, 10);
    cols = parseInt(colsInput.value, 10);

    // Validate input
    if (isNaN(rows) || rows < 5 || rows > 25 || isNaN(cols) || cols < 5 || cols > 25) {
        alert('Please enter valid dimensions between 5 and 25.');
        return;
    }

    // Disable generate button and indicate loading
    generateButton.disabled = true;
    generateButton.textContent = 'Generating...';
    gridContainer.classList.add('loading'); // Optionally add a loading class to the grid

    // Read difficulty from the slider just before generating
    difficulty = parseInt(difficultySlider.value, 10);
    console.log(`Generating a ${rows}x${cols} board with difficulty ${difficulty}...`);

    // Map difficulty (1-5) to fill percentage (higher percentage = easier)
    const fillPercentages = {
        1: 0.70, // Easiest (densest)
        2: 0.60,
        3: 0.50, // Medium
        4: 0.40,
        5: 0.30  // Hardest (sparsest)
    };
    const fillPercentage = fillPercentages[difficulty] || 0.50; // Default to medium if invalid

    // Generate pixel art and description from AI
    try {
        const result = await window.electronAPI.invokeGeneratePixelArt(rows, cols, fillPercentage, difficulty);
        pixelArtDescription = result.description; // Store description
        filledPixels = result.pixels;
        console.log("AI-generated pixel art description:", pixelArtDescription);
        console.log("AI-generated filled pixels:", filledPixels);

        // Create the board based on the filled pixels
        currentBoard = Array(rows).fill(null).map(() => Array(cols).fill(0));
        filledPixels.forEach(([r, c, color]) => {
             // Ensure coordinates are within bounds before assigning
            if (r >= 0 && r < rows && c >= 0 && c < cols) {
                currentBoard[r][c] = 1; // Mark the cell as filled
            } else {
                console.warn(`AI provided out-of-bounds pixel: [${r}, ${c}] for a ${rows}x${cols} grid. Skipping.`);
            }
        });


        generateNewBoard(rows, cols, difficulty);
        displayBoard(rows, cols);
        displayHints(currentBoard); // Display hints based on the generated solution
    } catch (error) {
        console.error("Error generating pixel art:", error);
        alert('Error generating pixel art. Please try again.');
    } finally {
        // Re-enable generate button and reset text
        generateButton.disabled = false;
        generateButton.textContent = 'Generate Board';
        gridContainer.classList.remove('loading'); // Remove loading class
    }
});

gridContainer.addEventListener('click', (event) => {
    if (!boardInteractionEnabled) return; // Do nothing if interaction is disabled

    if (event.target.classList.contains('cell')) {
        const r = parseInt(event.target.dataset.row, 10);
        const c = parseInt(event.target.dataset.col, 10);
        toggleCell(event.target, r, c);
    }
});

checkButton.addEventListener('click', checkSolution);
highlightButton.addEventListener('click', highlightErrors);
showButton.addEventListener('click', showSolution);

// --- Game Logic Functions ---

function generateNewBoard(numRows, numCols, difficultyLevel) {
    playerBoard = Array(numRows).fill(null).map(() => Array(numCols).fill(0)); // 0: empty, 1: filled, 2: marked 'X'

    console.log(`Generated Solution Board:`);
    currentBoard.forEach(row => console.log(row.join(' ')));

    // Hide interpretation results when a new board is generated
    interpretationResultDiv.style.display = 'none';
    interpretationResultDiv.textContent = '';
    interpretationResultDiv.classList.remove('loading');

    pixelArtDescriptionDiv.style.display = 'none'; // Hide description on new board
    pixelArtDescriptionDiv.textContent = '';

    interpretButton.style.display = 'none'; // Hide interpret button on new board

    boardInteractionEnabled = true; // Enable board interaction for the new board
}

function displayBoard(numRows, numCols) {
    gridContainer.innerHTML = ''; // Clear previous grid
    gridContainer.style.gridTemplateColumns = `repeat(${numCols}, 25px)`; // Adjust cell size as needed
    gridContainer.style.gridTemplateRows = `repeat(${numRows}, 25px)`;

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            gridContainer.appendChild(cell);
        }
    }
    // Adjust container visibility/layout if needed
    gameContainer.style.display = 'grid'; // Or flex, depending on layout needs
    // Position hints relative to the grid (this might need CSS adjustments)
    // Example positioning (adjust in CSS):
    gameContainer.style.gridTemplateAreas = `
        ". colhints"
        "rowhints grid"
    `;
    colHintsContainer.style.gridArea = 'colhints';
    rowHintsContainer.style.gridArea = 'rowhints';
    gridContainer.style.gridArea = 'grid';
}

function calculateHints(board) {
    const numRows = board.length;
    const numCols = board[0].length;
    const rowHints = [];
    const colHints = [];

    // Calculate row hints
    for (let r = 0; r < numRows; r++) {
        rowHints.push(calculateLineHints(board[r]));
    }

    // Calculate column hints
    for (let c = 0; c < numCols; c++) {
        const column = board.map(row => row[c]);
        colHints.push(calculateLineHints(column));
    }

    return { rowHints, colHints };
}

function calculateLineHints(line) {
    const hints = [];
    let count = 0;
    for (const cell of line) {
        if (cell === 1) {
            count++;
        } else {
            if (count > 0) {
                hints.push(count);
            }
            count = 0;
        }
    }
    if (count > 0) {
        hints.push(count);
    }
    return hints.length > 0 ? hints : [0]; // Represent empty lines with [0]
}

function displayHints(board) {
    const { rowHints, colHints } = calculateHints(board);

    // Display Column Hints
    colHintsContainer.innerHTML = '';
    colHintsContainer.style.gridTemplateColumns = `repeat(${cols}, 25px)`; // Match grid cell size
    colHints.forEach(hints => {
        const hintDiv = document.createElement('div');
        hintDiv.classList.add('hint', 'col-hint');
        hintDiv.innerHTML = hints.join('<br>'); // Display hints vertically
        colHintsContainer.appendChild(hintDiv);
    });

     // Display Row Hints
    rowHintsContainer.innerHTML = '';
    rowHintsContainer.style.gridTemplateRows = `repeat(${rows}, 25px)`; // Match grid cell size
    rowHints.forEach(hints => {
        const hintDiv = document.createElement('div');
        hintDiv.classList.add('hint', 'row-hint');
        hintDiv.textContent = hints.join(' '); // Display hints horizontally
        rowHintsContainer.appendChild(hintDiv);
    });
}

function toggleCell(cellElement, r, c) {
    clearHighlights(); // Clear any existing error highlights on move

    // Simple toggle: 0 (empty) -> 1 (filled) -> 0 (empty)
    // TODO: Add logic for right-click to mark 'X' (state 2) later
    if (playerBoard[r][c] === 0) {
        playerBoard[r][c] = 1;
        cellElement.classList.add('filled');
    } else {
        playerBoard[r][c] = 0;
        cellElement.classList.remove('filled');
        // cellElement.classList.remove('marked'); // If implementing marking
    }
    console.log(`Cell (${r}, ${c}) toggled. Player board:`, playerBoard);
}

function checkSolution() {
    if (!currentBoard || !playerBoard) return;

    let isCorrect = true;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Player board state 1 (filled) should match solution board state 1 (filled)
            // Player board state 0 or 2 (empty/marked) should match solution board state 0 (empty)
            const playerFilled = playerBoard[r][c] === 1;
            const solutionFilled = currentBoard[r][c] === 1;
            if (playerFilled !== solutionFilled) {
                isCorrect = false;
                break; // Exit early if one mistake is found
            }
        }
        if (!isCorrect) break;
    }

    if (isCorrect) {
        alert('Congratulations! The solution is correct!');
        // Call show solution to directly color the grid and show description
        showSolution();
        // Hide interpret button and result as they are no longer needed
        interpretButton.style.display = 'none';
        interpretationResultDiv.style.display = 'none';
        boardInteractionEnabled = false; // Disable board interaction on correct solution

    } else {
        alert('The solution is incorrect. Keep trying!');
        interpretButton.style.display = 'none'; // Hide if solution becomes incorrect
        interpretationResultDiv.style.display = 'none';
        clearColors(); // Clear colors if solution is incorrect
        pixelArtDescriptionDiv.style.display = 'none'; // Hide description if incorrect
    }
}

function highlightErrors() {
    if (!currentBoard || !playerBoard) return;

    clearHighlights(); // Clear previous highlights (cells and hints)

    let errorsFound = false;
    const rowsWithErrors = new Set();
    const colsWithErrors = new Set();

    // First pass: Identify rows and columns with errors
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const playerFilled = playerBoard[r][c] === 1;
            const solutionFilled = currentBoard[r][c] === 1;

            if (playerFilled !== solutionFilled) {
                errorsFound = true;
                rowsWithErrors.add(r);
                colsWithErrors.add(c);
                // Optional: Still highlight individual error cells?
                // const cellElement = gridContainer.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
                // cellElement.classList.add('error');
            }
        }
    }

    // Second pass: Highlight the hints for rows/columns with errors
    if (errorsFound) {
        // Highlight row hints
        const rowHintElements = rowHintsContainer.querySelectorAll('.row-hint');
        rowsWithErrors.forEach(r => {
            if (rowHintElements[r]) {
                rowHintElements[r].classList.add('error');
            }
        });

        // Highlight column hints
        const colHintElements = colHintsContainer.querySelectorAll('.col-hint');
        colsWithErrors.forEach(c => {
            if (colHintElements[c]) {
                colHintElements[c].classList.add('error');
            }
        });
    } else {
        alert('No errors found!');
    }
}

function showSolution() {
    if (!currentBoard) return;

    clearHighlights(); // Clear error highlights
    clearColors(); // Clear custom colors when showing solution

    // Apply colors to the grid cells directly
    applyCellColors(filledPixels);

    // Clean up description and display it below the controls
    let cleanedDescription = pixelArtDescription || ''; // Ensure it's a string
    // Remove anything up to and including "description" (case-insensitive) and optional punctuation/space
    cleanedDescription = cleanedDescription.replace(/^.*?description\s*[:\-–—]?\s*/i, '');
    // Remove "JSON Data:" and everything after (case-insensitive, multiline)
    cleanedDescription = cleanedDescription.replace(/\s*JSON Data:.*$/is, '');
    // Remove common markdown characters (*, _, `)
    cleanedDescription = cleanedDescription.replace(/[*_`]/g, '');
    // Remove trailing "json" (case-insensitive) potentially left over
    cleanedDescription = cleanedDescription.replace(/\s*json$/i, '');

    pixelArtDescriptionDiv.textContent = cleanedDescription.trim(); // Trim and set text
    pixelArtDescriptionDiv.style.display = 'block';
    boardInteractionEnabled = false; // Disable board interaction when showing solution
}

function clearHighlights() {
    // Clear cell highlights (if any were added)
    const errorCells = gridContainer.querySelectorAll('.cell.error');
    errorCells.forEach(cell => cell.classList.remove('error'));

    // Clear hint highlights
    const errorHints = document.querySelectorAll('.hint.error');
    errorHints.forEach(hint => hint.classList.remove('error'));
}

function clearColors() {
    const cells = gridContainer.querySelectorAll('.cell');
    cells.forEach(cell => {
        cell.style.backgroundColor = ''; // Reset background color
    });
    console.log("Cleared custom cell colors.");
}


function applyCellColors(colorData) {
    clearColors(); // Clear any previous colors first
    if (!colorData || !Array.isArray(colorData)) {
        console.warn("Invalid color data format received.");
        return;
    }

    colorData.forEach(item => {
        // Validate item format: [row, col, hex_string]
        if (Array.isArray(item) && item.length === 3 &&
            typeof item[0] === 'number' && typeof item[1] === 'number' && typeof item[2] === 'string' &&
            item[2].match(/^#[0-9a-fA-F]{6}$/)) { // Basic hex validation

            const r = item[0];
            const c = item[1];
            const color = item[2];

            // Check bounds and if the cell should be filled according to the solution
            if (r >= 0 && r < rows && c >= 0 && c < cols && currentBoard[r][c] === 1) { // Corrected bounds check for cols and added check for rows
                const cellElement = gridContainer.querySelector(`.cell[data-row='${r}'][data-col='${c}']`);
                if (cellElement) {
                    cellElement.style.backgroundColor = color;
                } else {
                     console.warn(`Could not find cell element for [${r}, ${c}]`);
                }
            } else {
                 // Only warn if the coordinates were actually out of bounds or the cell wasn't supposed to be filled
                 if (!(r >= 0 && r < rows && c >= 0 && c < cols) || currentBoard[r][c] !== 1) {
                    console.warn(`Skipping color for [${r}, ${c}]: Out of bounds, not a filled cell in solution, or invalid data.`);
                 }
            }
        } else {
            console.warn("Skipping invalid color data item:", item);
        }
    });
}


// --- Removed revealPixelArt function ---
/*
function revealPixelArt() { ... }
*/

// --- Initial Setup ---
difficultyValueSpan.textContent = difficultySlider.value; // Set initial difficulty display
// Optionally generate a default board on load
// generateNewBoard(rows, cols, difficulty); // Pass initial difficulty
// displayBoard(rows, cols);
// displayHints(currentBoard);
