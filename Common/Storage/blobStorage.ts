import { BlobServiceClient, AnonymousCredential, BlobItem, ContainerListBlobFlatSegmentResponse } from "@azure/storage-blob";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';
import * as fs from 'fs';
import { DefaultAzureCredential } from "@azure/identity";
import { URLBuilder } from "@azure/core-http";


let client: BlobServiceClient;


export function createBlobServiceClient(sasUrl: string): BlobServiceClient {
    client = new BlobServiceClient(sasUrl);
    return client
}

export async function listStorageContainers() {

    if (client === undefined)
        throw ("You must first call createBlobServiceClient with a a valid SasURL");

    var blobContainers: string[] = [];

    for await (const container of client.listContainers(
        {
            includeMetadata: false,
        },
    )
    ) {
        console.log("Container name:", container.name)
        console.log("Last Modified on:", container.properties.lastModified)
        blobContainers.push(container.name);
    }

    return blobContainers;
}

export async function getSasUrlForBlob(containerName:string, blobPath:string):Promise<string>{
    let sasUrl = client.url;
    let urlBuilder = new URLBuilder();
    urlBuilder.setPath(sasUrl);

    // Make sure to use encodeURIComponent here to remove ":" and other odd characters in the component path.
    // Or else the job HTTP Input will fail to work.
    urlBuilder.appendPath(encodeURIComponent(containerName));
    urlBuilder.appendPath(encodeURIComponent(blobPath));

    return urlBuilder.toString();
}

export async function listBlobsInContainer(container: string, pageSize:number, extensions?: string[], continuationToken?:string): Promise<BlobMatches> {

    let containerClient = client.getContainerClient(container);

    let i = 0;
    let blobList :BlobItem[] = [];
    let blobMatches: BlobMatches;
    let iterator :AsyncIterableIterator<ContainerListBlobFlatSegmentResponse>;

    if (continuationToken){
        iterator = containerClient.listBlobsFlat().byPage({ maxPageSize:pageSize, continuationToken: continuationToken});
    }else {
         iterator = containerClient.listBlobsFlat().byPage({ maxPageSize:pageSize});
    }

    let response: ContainerListBlobFlatSegmentResponse = (await iterator.next()).value;

    // Scan for blobs which match the extensions
    for (const blob of response.segment.blobItems) {

        if (extensions !== undefined) {
            extensions.forEach(element => {
                if (blob.name.indexOf(element) > -1)
                {
                    console.log("Found blob with extension: ",element)
                    blobList.push(blob);
                    i++
                }
            });
        }
    }

    blobMatches = {
        blobItems: blobList,
        matchCount:i,
        continuationToken: response.continuationToken
    }
    
    return blobMatches

}


export interface BlobMatches{
    blobItems: BlobItem[],
    matchCount:number
    continuationToken: string |undefined
}