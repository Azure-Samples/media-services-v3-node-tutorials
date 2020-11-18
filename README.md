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
