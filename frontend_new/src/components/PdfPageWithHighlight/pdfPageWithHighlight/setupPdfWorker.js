import { pdfjs } from 'react-pdf'
import pdfjsWorker from 'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url'

if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `${pdfjsWorker}?v=react-pdf-worker-20260430`
}
