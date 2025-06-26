#!/usr/bin/env node

/**
 * MCP Inspector Auto-Launch Utility (Node.js version)
 * 
 * This script runs the MCP inspector and automatically opens Safari 
 * when the authentication token is generated in the output.
 */

const { spawn } = require('child_process');
const { exec } = require('child_process');

console.log('🔍 Starting MCP Inspector...');
console.log('📋 Monitoring output for authentication token...');

// Spawn the MCP inspector process
const inspector = spawn('npx', ['@modelcontextprotocol/inspector'], {
    stdio: ['inherit', 'pipe', 'pipe']
});

let authTokenFound = false;
let inspectorReady = false;
let authUrl = null;

// Function to process output lines
function processLine(line) {
    console.log(line);
    
    // Check if line contains the MCP_PROXY_AUTH_TOKEN URL
    if (line.includes('MCP_PROXY_AUTH_TOKEN=') && !authTokenFound) {
        // Extract the URL using regex
        const urlMatch = line.match(/http:\/\/localhost:\d+\/\?MCP_PROXY_AUTH_TOKEN=[a-zA-Z0-9]+/);
        
        if (urlMatch) {
            authTokenFound = true;
            authUrl = urlMatch[0];
            console.log('');
            console.log('🚀 Authentication token detected!');
            console.log('⏳ Waiting for MCP Inspector to be fully ready...');
            
            // Check if inspector is already ready, if so launch immediately
            if (inspectorReady) {
                launchSafari();
            }
        }
    }
    
    // Check if MCP Inspector is up and running
    if (line.includes('MCP Inspector is up and running') && !inspectorReady) {
        inspectorReady = true;
        console.log('✅ MCP Inspector is ready!');
        
        // If we have the auth URL and inspector is ready, launch Safari
        if (authTokenFound && authUrl) {
            launchSafari();
        }
    }
}

// Function to launch Safari with the authenticated URL
function launchSafari() {
    if (!authUrl) return;
    
    console.log('');
    console.log(`🌐 Launching Safari with URL: ${authUrl}`);
    console.log('');
    
    exec(`open -a Safari "${authUrl}"`, (error) => {
        if (error) {
            console.error('❌ Failed to launch Safari:', error.message);
            console.log(`💡 Please manually open this URL in your browser: ${authUrl}`);
        } else {
            console.log('✅ Safari launched successfully!');
            console.log('💡 You can now use the MCP Inspector in your browser');
        }
        console.log('');
        console.log('Press Ctrl+C to stop the MCP Inspector when done...');
    });
}

// Handle stdout
inspector.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            processLine(line.trim());
        }
    });
});

// Handle stderr
inspector.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            processLine(line.trim());
        }
    });
});

// Handle process exit
inspector.on('close', (code) => {
    console.log('');
    if (code === 0) {
        console.log('✅ MCP Inspector exited successfully');
    } else {
        console.log(`❌ MCP Inspector exited with code ${code}`);
    }
});

// Handle process errors
inspector.on('error', (error) => {
    console.error('❌ Failed to start MCP Inspector:', error.message);
    console.log('💡 Make sure you have npx and @modelcontextprotocol/inspector available');
    process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('');
    console.log('🛑 Stopping MCP Inspector...');
    inspector.kill('SIGTERM');
    process.exit(0);
});

// Handle other termination signals
process.on('SIGTERM', () => {
    inspector.kill('SIGTERM');
    process.exit(0);
});
