import { useEffect, useRef } from "react";
import { DDV, EditViewer } from "dynamsoft-document-viewer";
import "./viewer.css"
import "dynamsoft-document-viewer/dist/ddv.css"

export default function Viewer() {
  const viewer = useRef<EditViewer|null>(null);
  const container = useRef<HTMLDivElement>(null);
  const initializationStarted = useRef(false);
  const init = async () => {
    DDV.on('error', (e) => {
      alert(e.message)
    })
  
    // Public trial license which is valid for 24 hours
    // You can request a 30-day trial key from https://www.dynamsoft.com/customer/license/trialLicense?product=ddv&deploymenttype=browser
    DDV.Core.license = "DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9";
    DDV.Core.engineResourcePath = "/dynamsoft-document-viewer/engine";
    // Preload DDV Resource
    DDV.Core.loadWasm();
    await DDV.Core.init();

    viewer.current = new DDV.EditViewer({
      container: container.current!
    });
  }

  useEffect(() => {
    if (!initializationStarted.current) {
      initializationStarted.current = true;
      init();
    }
  }, [])

  return (
    <>
      <div ref={container} id="container"></div>  
    </>
  )
}