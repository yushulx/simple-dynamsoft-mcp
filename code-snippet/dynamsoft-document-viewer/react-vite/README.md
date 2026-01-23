# Hello World Vite + React App

This project was bootstrapped with [Create Vite (template React)](https://cn.vitejs.dev/guide/#scaffolding-your-first-vite-project). It utilizes the solution [Dynamsoft Document Viewer](https://www.dynamsoft.com/document-viewer/docs/introduction/) to provide the following functionalities

- Viewing and editing images and PDFs
- PDF annotation
- Page manipulation
- Image quality enhancement
- Document saving

## Usage

Environment: Node.js v20.9.0

1. Apply for a [30-day free trial license](https://www.dynamsoft.com/customer/license/trialLicense?product=ddv&deploymenttype=browser) of Dynamsoft Document Viewer.

2. Update the license key in `src\components\Viewer.jsx` file:

   ```javascript
   // your license key
   DDV.Core.license = "DLS2eyJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSJ9";
   ```

3. Install the dependencies:

   ```
   npm install
   ```

4. Run the application as follows:

   ```
   npm run dev
   ```

## Build

Run `npm run build` to build the project. The build artifacts will be stored in the `dist/` directory. 
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.<br />
Your app is ready to be deployed!