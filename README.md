---
page_type: sample
languages:
- javascript
- typescript
- nodejs
products:
- azure
- azure-media-services
name: Azure Media Services v3 Node.js Typescript Samples
description: "This repository contains samples showing how to use Azure Media Services v3 API using Node.js and Typescript"
urlFragment: media-services-v3-node-tutorials
---

# Azure Media Services v3 Node samples (JavaScript SDK version 10.0.0 or higher)

This repository contains samples showing how to use the [Azure Media Services v3](https://docs.microsoft.com/azure/media-services/latest/media-services-overview) API using the [@azure/arm-mediaservices](https://www.npmjs.com/package/@azure/arm-mediaservices) package for node.js.

These tutorials work with the new [JavaScript next generation Azure SDK](https://github.com/Azure/azure-sdk-for-js/blob/main/documentation/next-generation-quickstart.md).
The new preview SDKs for JavaScript supports Azure Identity, HTTP pipeline, error-handling.,etc, and they also follow the new Azure SDK guidelines which create easy-to-use APIs that are idiomatic, compatible, and dependable. 
See [TypeScript Design Guidelines](https://azure.github.io/azure-sdk/typescript_design.html) for more information.

> [!NOTE]
> To make sure you are using the latest package, check [@azure/arm-mediaservices](https://www.npmjs.com/package/@azure/arm-mediaservices).
> Version 10.0.0-beta.1 of *@azure/arm-mediaservices* supports the [Media Services ARM API version 2021-06-01](https://github.com/Azure/azure-rest-api-specs/tree/main/specification/mediaservices/resource-manager/Microsoft.Media/stable/2021-06-01)

## Overview

The projects in this repository were created using Visual Studio Code.

|Project name|Description|
|---|---|
|[Create an account from code](/Account/CreateAccount)|The sample shows how to create a Media Services account and set the primary storage account, in addition to advanced configuration settings including Key Delivery IP allowlist, Managed Identity, storage auth, and bring your own encryption key.|
|[Hello World - list assets](/HelloWorld-ListAssets/index.ts)|Basic example on how to connect and list assets |
|[Live streaming](/Live/index.ts)| Basic live streaming example. **WARNING**, make sure to check that all resources are cleaned up and no longer billing in portal when using live|
|[Upload and stream HLS and DASH](/StreamFilesSample/index.ts)| Basic example for uploading a local file or encoding from a source URL. Sample shows how to use storage SDK to download content, and shows how to stream to a player |
|[Upload and stream HLS and DASH with Playready and Widevine DRM](/StreamFilesWithDRMSample/index.ts)| Demonstrates how to encode and stream using Widevine and PlayReady DRM |
|[Upload and use AI to index videos and audio](/VideoIndexerSample/index.ts)| Example of using the Video and Audio Analyzer presets to generate metadata and insights from a video or audio file |
|[Basic Encoding with H264](/VideoEncoding/Encoding_H264/index.ts)| Shows how to use the standard encoder to encode a source file into H264 format with thumbnails |
|[Content Aware encoding with H264](/VideoEncoding/Encoding_H264_ContentAware/index.ts)| Example of using the standard encoder with Content Aware encoding to automatically generate the best quality adaptive bitrate streaming set based on an analysis of the source files contents|
|[Content Aware encoding Constrained with H264](/VideoEncoding/Encoding_H264_ContentAware_Constrained/index.ts)| Demonstrates how to control the output settings of the Content Aware encoding preset to make the outputs more deterministic to your encoding needs and costs. This will still auto generate the best quality adaptive bitrate streaming set based on an analysis of the source files contents, but constrain the output to your desired ranges.|
|[Content Aware encoding with HEVC](/VideoEncoding/Encoding_HEVC_ContentAware/index.ts)| Example of using the standard encoder with Content Aware encoding to automatically generate the best quality HEVC (H.265) adaptive bitrate streaming set based on an analysis of the source files contents|

## Prerequisites
1. Download and install [Visual Studio Code](https://code.visualstudio.com/Download)
2. Install [Node.js](https://nodejs.org/en/download/)
3. Download and install [Typescript](https://www.typescriptlang.org/download)

    ### Install Typescript via npm
    You can use npm to install TypeScript globally, this means you can use the tsc command anywhere in your terminal.
    
    To do this, run ```npm install -g typescript```. This will install the latest version.
    

## Run samples

1. Clone the repository

    ```git clone https://github.com/Azure-Samples/media-services-v3-node-tutorials.git ```

2. Open Visual Studio Code

    ``` code . ```

4. Rename the 'sample.env' file to '.env' and fill out the details from your Azure Media Services account portal API Access page. If you have not yet created an AMS account, first go into the Azure portal and search for Media Services and create a new account in the region of your choice. After creating the account, navigate to the API Access page and create an Azure Active Directory(AAD) Service Principal to generate the connection details required for the .env file. Copy the settings from the API Access blade that are required in the .env file.
If you plan to use the DRM sample, you will need to generate a random base64 "DRM_SYMMETRIC_KEY" to use in the .env file as well. 
To get the exact values, follow [Access APIs](https://docs.microsoft.com/azure/media-services/latest/access-api-cli-how-to).

5. Open **Terminal** in VS Code (Ctrl+Shift+`), make sure you are in the root folder with the package.json file and execute the following command to download all the required npm packages.

    ```
    npm install 
    ```

6. Next, in the Explorer view, open the "HelloWorld-ListAssets" folder, open the list-assets.ts file and press F5 to begin compiling the Typescript and launch the Debugger. Each project in this sample collection contains a single typescript file that can be launched by opening it and pressing the F5 key to enter the debugger. You can now set breakpoints, and walk through the code to learn how to implement basic Media Services scenarios in Node.js

The output from the HelloWorld-ListAssets may be empty if this is a new Media Services account with no new assets.  Just make sure that the script executes cleanly through on the first run without any errors, and you can then upload some content into the portal to see the results again on the second run.  If you have no errors and are ready to move on, move next to the StreamFilesSample for tutorial on how to upload a local file, encode it with "content aware encoding" and stream it with the Azure Media Player.

## Common Issues and Troubleshooting

* Assets in Media Services have naming conventions that must be adhered to in order to avoid errors. For example the client.Assets.CreateOrUpdateAsync can fail with message "The resource type is invalid" if the name does not match the [naming conventions listed in this article](https://docs.microsoft.com/en-us/azure/media-services/latest/media-services-apis-overview#naming-conventions)
