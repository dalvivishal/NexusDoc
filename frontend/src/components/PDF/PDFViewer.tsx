import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PDFViewerProps {
  file: string;
  activePage: number | null;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ file, activePage }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  useEffect(() => {
    if (activePage && scrollRef.current) {
      // Find the page element and scroll to it
      const pageElement = document.getElementById(`pdf-page-${activePage}`);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add a temporary highlight effect
        pageElement.style.boxShadow = '0 0 0 2px var(--accent-color)';
        setTimeout(() => {
          pageElement.style.boxShadow = 'var(--shadow-sm)';
        }, 2000);
      }
    }
  }, [activePage]);

  return (
    <div 
      className="h-full w-full overflow-y-auto" 
      ref={scrollRef}
      style={{ padding: '2rem 0', backgroundColor: 'var(--bg-panel)' }}
    >
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        className="flex flex-col items-center gap-4"
        loading={<div className="animate-pulse p-4">Loading document...</div>}
      >
        {Array.from(new Array(numPages), (el, index) => (
          <div 
            key={`page_${index + 1}`} 
            id={`pdf-page-${index + 1}`}
            style={{ 
              boxShadow: 'var(--shadow-sm)', 
              transition: 'box-shadow var(--transition-normal)'
            }}
          >
            <Page 
              pageNumber={index + 1} 
              renderTextLayer={true}
              renderAnnotationLayer={true}
              width={600} 
            />
          </div>
        ))}
      </Document>
    </div>
  );
};
