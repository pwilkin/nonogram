// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Preload scripts run in a privileged environment before the renderer process loads.
// They have access to some Node.js APIs and can be used to expose specific
// functionalities to the renderer process in a controlled way via contextBridge.

const { contextBridge, ipcRenderer } = require('electron'); // Import necessary modules

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Function the renderer can call to trigger the main process task
  // Now sends both image data and the board pattern
  invokeInterpretImage: (base64ImageData, boardData) => ipcRenderer.invoke('interpret-image', base64ImageData, boardData),
  invokeGeneratePixelArt: (rows, cols, density) => ipcRenderer.invoke('generate-pixel-art', rows, cols, density)
});

console.log('Preload script loaded.');

// For this simple example, we don't strictly need a preload script yet,
// but it's good practice to include it for future use, especially if you
// need to communicate between renderer and main processes or access Node.js modules securely.
