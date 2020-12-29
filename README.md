---
page_type: sample
languages:
- javascript
products:
- azure
description: "This repository contains samples showing how to use Azure Media Services v3 API using node.js."
urlFragment: media-services-v3-node-tutorials
---

# Azure Media Services v3 Node samples

This repository contains samples showing how to use [Azure Media Services v3](https://docs.microsoft.com/azure/media-services/latest/media-services-overview) API using node.js. 

> [!NOTE]
> To make sure you are using the latest package, check [azure-arm-mediaservices]( https://www.npmjs.com/package/@azure/arm-mediaservices).

## This sample shows how to do the following operations of Storage Blob with Storage SDK

- List blobs inside a container
- Downloads a blob to a local file
- Uploads to a blob from local file

## Use latest Storage SDK

The Storage SDK in this repo is **@azure/storage-blob**. It's strongly recommended that use the [latest](https://www.npmjs.com/package/@azure/storage-blob) version of the Storage Blob SDK package, please refer to the following examples:

[iterators-blobs.js](https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/storage/storage-blob/samples/javascript/iterators-blobs.js) - Examples for common Storage Blob tasks:
- Create container client
- Upload a blob
- List blobs inside a container
- Delete container

[advanced.js](https://github.com/Azure/azure-sdk-for-js/blob/master/sdk/storage/storage-blob/samples/javascript/advanced.js) - Examples for common Storage Blob tasks:
- Create a container
- Create a blob
- Uploads a local file to a blob
- Uploads a Node.js Readable stream into block blob
- Downloads a blob in parallel to a buffer
- Sets the tier on a blob
- Downloads a blob
- Delete container

## Prerequisites

Install [Node.js](https://nodejs.org/en/download/)

## Run samples

1. For the project that you want to run, update the "endpoint config" parameters in **index.js** with your subscription, account, and service principal information.

    To get the values, follow [Access APIs](https://docs.microsoft.com/azure/media-services/latest/access-api-cli-how-to).
2. Create a folder where you want for the output files to go and update the value of the **outputFolder** variable in the **index.js** file.
3. Open **command prompt**, browse to the sample's directory, and execute the following commands.

    ```
    npm install 
    node index.js
    ```
