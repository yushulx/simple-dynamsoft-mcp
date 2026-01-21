import { Component } from '@angular/core';
import { DDV } from 'dynamsoft-document-viewer';

// The external CSS for an Angular project should be imported via the angular.json file.
// import "dynamsoft-document-viewer/dist/ddv.css"

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [],
  templateUrl: './viewer.component.html',
  styleUrl: './viewer.component.css'
})

export class ViewerComponent {
  async ngOnInit() {
    DDV.on('error', (e) => {
      alert(e.message)
    })

    DDV.Core.license = 'DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9';
    DDV.Core.engineResourcePath = '/dynamsoft-document-viewer/dist/engine';
    DDV.Core.loadWasm();
    await DDV.Core.init();

    const viewer = new DDV.EditViewer({
      container: 'container'
    });
  }
}