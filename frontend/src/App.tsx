import { useState } from 'react';
import { PDFViewer } from './components/PDF/PDFViewer';
import { ChatInterface } from './components/Chat/ChatInterface';
import { UploadCloud } from 'lucide-react';
import axios from 'axios';
import classNames from 'classnames';

export default function App() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activePage, setActivePage] = useState<number | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPdfFile(file);
      setPdfUrl(URL.createObjectURL(file));
      
      const formData = new FormData();
      formData.append('file', file);
      
      setIsUploading(true);
      try {
        await axios.post('http://localhost:8000/api/v1/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log("Document processed and indexed.");
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleCitationClick = (page: number) => {
    setActivePage(page);
  };

  return (
    <div className="app-container">
      {/* Left Panel: PDF Viewer */}
      <div className="glass-panel flex-1 flex flex-col overflow-hidden animate-fade-in relative" style={{ flex: '1.2' }}>
        {!pdfUrl ? (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ color: 'var(--text-secondary)' }}>
            <UploadCloud size={48} className="mb-4" />
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Upload Document</h2>
            <p>Upload a PDF to start asking questions.</p>
            <label className="btn btn-primary mt-6">
              Browse Files
              <input 
                type="file" 
                accept=".pdf" 
                className="hidden" 
                style={{ display: 'none' }}
                onChange={handleFileUpload} 
              />
            </label>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
             {isUploading && (
                <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center z-10 animate-pulse">
                   Processing Document using Langchain...
                </div>
             )}
            <PDFViewer file={pdfUrl} activePage={activePage} />
          </div>
        )}
      </div>

      {/* Right Panel: Chat Interface */}
      <div className="glass-panel flex-1 flex flex-col overflow-hidden animate-fade-in" style={{ flex: '1' }}>
         <ChatInterface 
           onCitationClick={handleCitationClick} 
           isDisabled={!pdfFile || isUploading}
         />
      </div>
    </div>
  );
}
