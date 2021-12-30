---
topic: sample
languages:
  - javascript,typescript
products:
  - azure-media-services
description: "This sample demonstrates how to batch encode from a remote storage URL, preserving the source hierarchy and output the encoded results to another storage account using SAS URL."
---

# Encode from a remote storage account using SAS Url

This sample shows how you can encode an entire remote Azure Storage account using a SAS URL to the account. 
In addition, this sample allows you to specify the source file extensions (e.g. .mp4, .mov) that you are scanning for in the remote storage account. The sample will
crawl the hierarchy (if there are virtual folders) of the remote storage account and submit a defined Transform (content aware in this sample) job, wait for the job to complete and copy the outputs 
to a final output SAS URL container.  

The workflow is as follows:

1. Configure the .env file settings for this sample
1. Generate a Read/List SAS token URL in the portal under the storage accounts "shared access signature" menu.  This operation requires you to have the right permissions in the remote account.
   Grant the SAS allowed resource types : Service, Container, and Object.
   Grant the SAS allowed permissions: Read, List.
1. Set the **REMOTESTORAGEACCOUNTSAS** environment variable to the generated SAS URL - this is where the sample will "crawl" for content
1. Generate a seconds SAS URL for the **OUTPUTCONTAINERSAS** environment variable.  This can be a storage account root, or a specific container in a storage account to write the output hierarchy into.
   The sample can preserve virtual folder hierarchy, as well as re-use the container names that it finds in the remote storage account using the configuration settings at the top of the sample.
1. Set the desired configuration settings in the Sample Settings section (lines 58-80). 
1. Pay close attention to the settings for the file extension mappings in the variable *fileExtensionFilters*, as this will control the files that are submitted to the encoding Transform.
1. Adjust the *batchSize* setting to set the size of the page read during listing of blobs from a container.  This will also control the max batch size submitted for encoding.
1. The sample will first create a new Transform with the desired encoding settings.  This Transform is the only one used for each matching source file, but if you wanted to modify this sample you could add some more logic to submit jobs based on the extension type or source folder names, etc.
1. The sample next lists all containers in the source SAS URL location, using the blobHelper library in *Common\Encoding\encodingJobHelpers.ts*

    ```typescript
    let containers: string[] = await blobHelper.listStorageContainers();
    ```

1. Next we iterate all of the containers and scan them sequentially.  The code will block and wait for each container to complete scanning and encoding.

  ```typescript
    for (const container of containers) {
        console.log("Scanning container:", container)
        let skipAmsAssets:boolean = true; // set this to skip over any containers that have the AMS default asset prefix of "asset-", which may be necessary if you are writing to the same storage as your AMS account

        const result = await scanContainerBatchSubmitJobs(container, fileExtensionFilters, batchSize, continuationToken, transformName, skipAmsAssets);
    }
  ```

1. The *scanContainerBatchSubmitJobs* async function returns a Promise that will resolve once all of the files in the container that match the file extension array are submitted to the encoding job and then copied to the final output destination SAS location.  Once the promise is resolved, code flow returns to the for loop on the container list above, and the next container is scanned.
1. There are optional settings to skip over AMS generated assets that have a name prefix of "asset-" when their containers are created. You may have custom code that modifies this prefix or uses custom container naming on creation of Assets, so you might need to modify the value used to match the prefix.
1. When all containers are scanned and jobs have completed, the sample will exit. You should then have a new hierarchy of containers or virtual folders in the output SAS location with the resulting encodings.
1. An optional flag will delete the intermediate JobOutput assets after copying the results to the output. Set the deleteSourceAssets boolean to false if you do not wish to have the generated assets deleted.  This may be desired if you want to use AMS for streaming the assets through the dynamic packager.
1. If you do not want to output the content to a remote SAS, but just generate Assets for AMS, set the *outputToSas* flag to false in the sample settings.

### Setting up the .env variables file

Use [sample.env](../../sample.env) as a template for the .env file to be created. The .env file must be placed at the root of the sample (same location than sample.env).
Connect to the Azure portal with your browser and go to your media services account / API access to get the .ENV data to store to the .env file.

This sample requires you to set the following environment variables for it to work (in addition to the required ones).

* **REMOTESTORAGEACCOUNTSAS** - this can point to the root of a storage account, or to a specific container in a remote account. It can point to any account that you have a SAS URL with the following grant permissions -  Grant the allowed resource types : Service, Container, and Object, Grant the allowed permissions: Read, List
* **OUTPUTCONTAINERSAS** - this points to the container that you want to write all of the outputs back into after encoding job is complete. The sample will preserve the original source hierarchy and virtual folders when writing the output. This can be modified or configured in the sample using the settings at the head of the sample configuration.


### Troubleshooting and Mods

If you find that the folder naming in the output folder is not working for your specific situation, be sure to look closely at the code for *getSourceFolderPathHierarchy*, where the output folder naming is determined. There are some string functions in here that are trimming the source virtual folder path to make it appropriate for the output naming. The sample does not explore all possible source folder hierarchy possibilities, but only provides a basis to get started from.

Other modifications that could be made to this sample (contributions or additional sample folders based on this sample are encouraged! Please contribute!)

1. Add a filter for the output asset file extension types, so you can filter out the .json or metadata files and only copy the output .mp4 files and .jpg thumbnails as needed
1. Add support for managed identity
1. Add support for private storage accounts
1. Add support for non SAS based authentication if a higher level of secure auth is required
1. Add more business logic to choose which Transform to submit the job to based on input location and folder
1. Add multi-region encoding support - distributing the encoding job across regions can help with speed and reliability.
1. Add more logging of results and failed jobs, and provide a way to resume or re-submit errored jobs from the resulting log file.