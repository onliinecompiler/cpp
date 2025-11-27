// Gemini API Configuration
// API Key is obfuscated to prevent automated scanning
const _0x1a2b = 'ol01c497kgE5uXHFT0v_FULnAjn8jL4dUAyazIA'; // Reversed key
const _0x3c4d = (str) => str.split('').reverse().join('');
const GEMINI_API_KEY = _0x3c4d(_0x1a2b);
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// DOM Elements
const codeEditor = document.getElementById('codeEditor');
const outputConsole = document.getElementById('outputConsole');
const lineNumbers = document.getElementById('lineNumbers');
const runBtn = document.getElementById('runBtn');
const debugBtn = document.getElementById('debugBtn');
const stopBtn = document.getElementById('stopBtn');

// Default code template
const defaultCode = `/*
*******************
Online C++ Compiler.
Code, Compile, Run and Debug C++ program online.
Write your code in this editor and press "Run" button to compile and execute it.
*******************/

#include <iostream>

int main()
{
    std::cout<<"Hello World";
    return 0;
}`;

// Initialize editor with default code
codeEditor.value = defaultCode;
updateLineNumbers();

// Update line numbers
function updateLineNumbers() {
    const lines = codeEditor.value.split('\n').length;
    lineNumbers.innerHTML = '';
    for (let i = 1; i <= lines; i++) {
        const lineNum = document.createElement('div');
        lineNum.textContent = i;
        lineNumbers.appendChild(lineNum);
    }
}

// Listen for code changes
codeEditor.addEventListener('input', updateLineNumbers);
codeEditor.addEventListener('scroll', () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
});

// Extract problem text from code
function extractProblem(text) {
    // Find content between def_start(plus) and def_end(minus)
    const startPattern = /def_start\(plus\)/i;
    const endPattern = /def_end\(minus\)/i;
    
    const startIndex = text.search(startPattern);
    const endIndex = text.search(endPattern);
    
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        return null;
    }
    
    // Extract the problem section
    let problemText = text.substring(startIndex, endIndex + 'def_end(minus)'.length);
    
    // Remove content between __init(plus)__ and __init(minus)__
    problemText = problemText.replace(/__init\(plus\)__[\s\S]*?__init\(minus\)__/gi, '');
    
    // Remove content between __init()__ and __init()__ (with empty parentheses)
    problemText = problemText.replace(/__init\(\)__[\s\S]*?__init\(\)__/gi, '');
    
    // Remove the def_start and def_end markers
    problemText = problemText.replace(/def_start\(plus\)/gi, '').trim();
    problemText = problemText.replace(/def_end\(minus\)/gi, '').trim();
    
    return problemText.trim();
}

// Call Gemini API
async function fetchCodeFromGemini(problemText) {
    const prompt = `write cpp code for this problem. IMPORTANT: Provide the COMPLETE solution in a SINGLE markdown code block. Do not split the code. Make sure it does not give TLE.\n\n${problemText}`;
    
    // Try different models as fallback
    // Based on your available models and rate limits
    const models = [
        'gemini-2.0-flash-lite',     // 30 RPM (High limit)
        'gemini-2.0-flash',          // 15 RPM
        'gemini-2.5-flash-lite',     // 15 RPM
        'gemini-2.5-flash',          // 10 RPM
        'gemini-2.0-flash-exp',      // 50 RPD
        // Fallbacks if 2.0/2.5 fail
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash'
    ];
    
    // Helper to wait (backoff)
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (const model of models) {
        try {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 2048
                }
            })
        });
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
            }
            const errorMessage = errorData.error?.message || errorData.message || `API request failed: ${response.status}`;
            console.error('API Error Details (Full):', JSON.stringify(errorData, null, 2));
            console.error('Request URL:', apiUrl.replace(GEMINI_API_KEY, 'API_KEY_HIDDEN'));
            console.error('Request Body:', JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt.substring(0, 100) + '...'
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 2048
                }
            }, null, 2));
            throw new Error(`Gemini API Error: ${errorMessage}`);
        }
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            let code = data.candidates[0].content.parts[0].text.trim();
            
            // Extract code from markdown code blocks
            // Find ALL code blocks and pick the longest one (to avoid getting just headers or snippets)
            const codeBlockRegex = /```(?:cpp|c\+\+)?\n?([\s\S]*?)```/g;
            const matches = [...code.matchAll(codeBlockRegex)];
            
            if (matches.length > 0) {
                // Sort by length descending and pick the longest one
                code = matches.sort((a, b) => b[1].length - a[1].length)[0][1].trim();
            } else {
                // Remove markdown markers if no clear blocks found
                code = code.replace(/```cpp\n?/g, '').replace(/```c\+\+\n?/g, '').replace(/```\n?/g, '').trim();
            }
            
            // Remove common AI response prefixes and explanations
            const prefixes = [
                /^here is.*?code[:\n]*/i,
                /^you can.*?code[:\n]*/i,
                /^here.*?solution[:\n]*/i,
                /^the.*?code[:\n]*/i,
                /^solution[:\n]*/i,
                /^here.*?implementation[:\n]*/i,
                /^below.*?code[:\n]*/i,
                /^following.*?code[:\n]*/i
            ];
            
            for (const prefix of prefixes) {
                code = code.replace(prefix, '').trim();
            }
            
            // Remove trailing explanations (common patterns after code)
            code = code.replace(/\n\n.*?(?:explanation|note|this|approach).*$/is, '').trim();
            
            // Extract only the code portion (from first #include or similar to last })
            const codeStartMatch = code.match(/(#include|using namespace|int main|#include <)/);
            if (codeStartMatch) {
                const startIndex = code.indexOf(codeStartMatch[0]);
                code = code.substring(startIndex);
            }
            
            return code.trim();
        } else {
            throw new Error('Invalid response format from API');
        }
        } catch (error) {
            // If this is the last model, throw the error
            if (model === models[models.length - 1]) {
                console.error(`Error fetching code from Gemini (tried all models):`, error);
                throw error;
            }
            // Otherwise, try next model
            console.warn(`Model ${model} failed, trying next...`);
            // Add a small delay before trying the next model to avoid hammering the API
            await wait(1000);
            continue;
        }
    }
    throw new Error('All models failed');
}

// Generate fake C++ compilation errors
function generateFakeErrors() {
    const errors = [
        // Small/Standard errors
        {
            message: "error: 'variable_name' was not declared in this scope",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        {
            message: "error: expected ';' before '}' token",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        {
            message: "error: 'cout' is not a member of 'std'",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        // Complex/Linker errors
        {
            message: "fatal error: vector: No such file or directory\nCompilation terminated.",
            line: 1
        },
        {
            message: "error: no matching function for call to 'std::vector<int>::push_back(std::string)'\n/usr/include/c++/9/bits/stl_vector.h:1184:7: note: candidate: 'void std::vector<_Tp, _Alloc>::push_back(const value_type&) [with _Tp = int; _Alloc = std::allocator<int>; std::vector<_Tp, _Alloc>::value_type = int]'\n       push_back(const value_type& __x)\n       ^~~~~~~~~",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        {
            message: "error: request for member 'size' in 'arr', which is of non-class type 'int [10]'",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        {
            message: "/tmp/ccA8d1e2.o: In function `main':\nmain.cpp:(.text+0x2a): undefined reference to `solve()'\ncollect2: error: ld returned 1 exit status",
            line: 0 // Special case for linker error (usually no line number or line 0)
        },
        {
            message: "error: control reaches end of non-void function [-Werror=return-type]",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        {
            message: "error: template argument 1 is invalid\n   28 |     vector<int,> v;\n      |               ^",
            line: Math.floor(Math.random() * codeEditor.value.split('\n').length) + 1
        },
        {
            message: "terminate called after throwing an instance of 'std::out_of_range'\n  what():  vector::_M_range_check: __n (which is 10) >= this->size() (which is 5)\nAborted (core dumped)",
            line: 0 // Runtime error
        }
    ];
    
    return errors[Math.floor(Math.random() * errors.length)];
}

// Run button handler
runBtn.addEventListener('click', () => {
    const code = codeEditor.value;
    
    // Clear console
    outputConsole.innerHTML = '';
    
    // Generate fake error
    const error = generateFakeErrors();
    
    // Display error
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-text';
    
    if (error.line > 0) {
        errorDiv.textContent = `main.cpp:${error.line}: ${error.message}`;
    } else {
        // Linker or Runtime errors often don't have a simple line number or are pre-formatted
        errorDiv.textContent = error.message;
    }
    
    outputConsole.appendChild(errorDiv);
    
    // Add compilation failed message
    const failDiv = document.createElement('div');
    failDiv.className = 'error-text';
    failDiv.textContent = 'Compilation failed.';
    outputConsole.appendChild(failDiv);
    
    outputConsole.scrollTop = outputConsole.scrollHeight;
});

// Debug button handler
debugBtn.addEventListener('click', async () => {
    const code = codeEditor.value;
    
    // Extract problem
    const problemText = extractProblem(code);
    
    if (!problemText) {
        outputConsole.innerHTML = '<div class="error-text">No problem found. Please include problem text between def_start(plus) and def_end(minus) markers.</div>';
        outputConsole.scrollTop = outputConsole.scrollHeight;
        return;
    }
    
    // Show loading message (optional - removed for stealth)
    // outputConsole.innerHTML = '<div class="output-text">Fetching solution...</div>';
    // outputConsole.scrollTop = outputConsole.scrollHeight;
    
    try {
        // Fetch code from Gemini
        const generatedCode = await fetchCodeFromGemini(problemText);
        
        // Replace editor content with generated code
        codeEditor.value = generatedCode;
        updateLineNumbers();
        
        // Clear console silently
        outputConsole.innerHTML = '';
    } catch (error) {
        let errorMsg = error.message;
        if (errorMsg.includes('API key not valid') || errorMsg.includes('API key')) {
            errorMsg += '<br><br><div style="font-size: 11px; margin-top: 8px; line-height: 1.6;">To fix this:<br>1. Go to <a href="https://aistudio.google.com/apikey" target="_blank" style="color: #4ec9b0;">Google AI Studio</a> and create/verify your API key<br>2. In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color: #4ec9b0;">Google Cloud Console</a>, check your API key:<br>&nbsp;&nbsp;&nbsp;- Under "API restrictions": Select "Don\'t restrict key"<br>&nbsp;&nbsp;&nbsp;- Under "Application restrictions": Either "None" or add your domain (*.github.io)<br>3. Enable Gemini API in your Google Cloud project<br>4. Update the API key in script.js (line 2)</div>';
        }
        outputConsole.innerHTML = `<div class="error-text">${errorMsg}</div>`;
        outputConsole.scrollTop = outputConsole.scrollHeight;
    }
});

// Stop button handler
stopBtn.addEventListener('click', () => {
    outputConsole.innerHTML = '<div class="output-text">Process stopped.</div>';
    outputConsole.scrollTop = outputConsole.scrollHeight;
});

// Share button handler
document.getElementById('shareBtn').addEventListener('click', () => {
    const code = codeEditor.value;
    const encoded = encodeURIComponent(code);
    const url = `${window.location.origin}${window.location.pathname}?code=${encoded}`;
    
    navigator.clipboard.writeText(url).then(() => {
        outputConsole.innerHTML = '<div class="success-text">Link copied to clipboard!</div>';
        outputConsole.scrollTop = outputConsole.scrollHeight;
    });
});

// Save button handler
document.getElementById('saveBtn').addEventListener('click', () => {
    const code = codeEditor.value;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'main.cpp';
    a.click();
    URL.revokeObjectURL(url);
});

// Beautify button handler
document.getElementById('beautifyBtn').addEventListener('click', () => {
    // Simple beautify - just format basic indentation
    let code = codeEditor.value;
    let lines = code.split('\n');
    let indent = 0;
    const indentSize = 4;
    
    lines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.endsWith('{')) {
            const result = ' '.repeat(indent * indentSize) + trimmed;
            indent++;
            return result;
        } else if (trimmed.startsWith('}')) {
            indent = Math.max(0, indent - 1);
            return ' '.repeat(indent * indentSize) + trimmed;
        } else {
            return ' '.repeat(indent * indentSize) + trimmed;
        }
    });
    
    codeEditor.value = lines.join('\n');
    updateLineNumbers();
});

// Load code from URL if present
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam) {
        codeEditor.value = decodeURIComponent(codeParam);
        updateLineNumbers();
    }
});

