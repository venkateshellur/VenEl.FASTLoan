document.addEventListener('DOMContentLoaded', () => {
    const processBtn = document.getElementById('process-text-btn');
    const manualText = document.getElementById('manual-text');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const dynamicArea = document.getElementById('dynamic-content-area');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingText = document.getElementById('loading-text');

    function setLoading(isLoading, message = 'Processing...') {
        if (isLoading) {
            loadingText.textContent = message;
            loadingIndicator.classList.remove('hidden');
            processBtn.disabled = true;
            processBtn.classList.add('opacity-50');
            
            // Show a friendly loading state in the dynamic area
            dynamicArea.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
                    <div class="loader"></div>
                    <p class="text-blue-600 font-medium text-lg">Agents are at work...</p>
                    <p class="text-gray-500 text-sm max-w-sm">${message}</p>
                </div>
            `;
            dynamicArea.classList.add('flex', 'items-center', 'justify-center');
        } else {
            loadingIndicator.classList.add('hidden');
            processBtn.disabled = false;
            processBtn.classList.remove('opacity-50');
        }
    }

    async function processDocument(text) {
        if (!text || text.trim() === '') return;
        
        setLoading(true, 'Agent parsing document & generating UI...');
        try {
            const response = await fetch('/api/upload-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentText: text })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            
            // Inject the Generative UI Agent's HTML Form
            dynamicArea.innerHTML = data.html;
            dynamicArea.classList.remove('flex', 'items-center', 'justify-center');
            
        } catch (error) {
            console.error(error);
            dynamicArea.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center space-y-4 bg-red-50 p-8 rounded-xl border border-red-100">
                    <svg class="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-red-700 font-bold text-xl">Agent Communication Interrupted</p>
                    <p class="text-red-500 text-sm max-w-sm">The connection to the AI model timed out or failed (possibly due to API usage limits or token exhaustion). Please try again after some time.</p>
                </div>
            `;
            dynamicArea.classList.add('flex', 'items-center', 'justify-center');
        } finally {
            setLoading(false);
        }
    }

    processBtn.addEventListener('click', () => {
        processDocument(manualText.value);
    });

    // File Input Handle
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.name.toLowerCase().endsWith('.pdf')) {
                setLoading(true, 'Extracting text from PDF...');
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    try {
                        const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
                        // Ensure pdfjsLib worker is set up
                        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                        const typedarray = new Uint8Array(evt.target.result);
                        const pdf = await pdfjs.getDocument(typedarray).promise;
                        let fullText = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            fullText += textContent.items.map(s => s.str).join(' ') + '\n';
                        }
                        if (fullText.trim() === '') {
                            setLoading(true, 'No text found. Running OCR on PDF images... (This may take a moment)');
                            const page = await pdf.getPage(1);
                            const viewport = page.getViewport({ scale: 2.0 });
                            const canvas = document.createElement('canvas');
                            const context = canvas.getContext('2d');
                            canvas.height = viewport.height;
                            canvas.width = viewport.width;
                            await page.render({ canvasContext: context, viewport: viewport }).promise;
                            
                            const result = await Tesseract.recognize(canvas, 'eng');
                            fullText = result.data.text;
                            
                            if (fullText.trim() === '') {
                                alert('Could not extract any text via OCR.');
                                setLoading(false);
                                return;
                            }
                        }

                        setLoading(false);
                        manualText.value = fullText;
                        processDocument(fullText);
                    } catch (err) {
                        console.error('PDF parsing error', err);
                        alert('Failed to parse PDF');
                        setLoading(false);
                    }
                };
                reader.readAsArrayBuffer(file);
            } else if (file.type.startsWith('image/')) {
                setLoading(true, 'Running OCR on image... (This may take a moment)');
                const reader = new FileReader();
                reader.onload = async function(evt) {
                    try {
                        const result = await Tesseract.recognize(evt.target.result, 'eng');
                        manualText.value = result.data.text;
                        setLoading(false);
                        processDocument(result.data.text);
                    } catch (err) {
                        console.error('OCR Error', err);
                        alert('Failed to extract text from image.');
                        setLoading(false);
                    }
                };
                reader.readAsDataURL(file);
            } else {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    manualText.value = evt.target.result;
                    processDocument(evt.target.result);
                };
                reader.readAsText(file);
            }
        }
    });

    // Global function to be called by the Agent-generated form
    window.submitEligibility = async function(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const dataObj = Object.fromEntries(formData.entries());

        setLoading(true, 'Agent scoring credit & generating Dashboard...');
        try {
            const response = await fetch('/api/check-eligibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formData: dataObj })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            
            // Inject the Generative UI Agent's HTML Dashboard
            dynamicArea.innerHTML = data.html;
            
            // Execute any scripts generated by the agent (e.g., Chart.js)
            const scripts = dynamicArea.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                // We create a new script element to force execution
                const newScript = document.createElement('script');
                newScript.text = scripts[i].text;
                document.body.appendChild(newScript).parentNode.removeChild(newScript);
            }
            
        } catch (error) {
            console.error(error);
            dynamicArea.innerHTML = `
                <div class="flex flex-col items-center justify-center text-center space-y-4 bg-red-50 p-8 rounded-xl border border-red-100">
                    <svg class="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-red-700 font-bold text-xl">Agent Communication Interrupted</p>
                    <p class="text-red-500 text-sm max-w-sm">The connection to the AI model timed out while scoring (possibly due to API usage limits or token exhaustion). Please try again after some time.</p>
                </div>
            `;
            dynamicArea.classList.add('flex', 'items-center', 'justify-center');
        } finally {
            setLoading(false);
        }
    };
});
