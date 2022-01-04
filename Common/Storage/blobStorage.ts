import { BlobServiceClient, AnonymousCredential, BlobItem, ContainerListBlobFlatSegmentResponse, BlobClient, Metadata } from "@azure/storage-blob";
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


export function createBlobClient(sasUrl: string): BlobClient {
    let blobClient = new BlobClient(sasUrl);
    return blobClient;
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
        blobContainers.push(container.name);
    }

    return blobContainers;
}

export async function getSasUrlForBlob(containerName: string, blobPath: string): Promise<string> {
    let sasUrl = client.url;
    let urlBuilder = new URLBuilder();
    urlBuilder.setPath(sasUrl);

    // Make sure to use encodeURIComponent here to remove ":" and other odd characters in the component path.
    // Or else the job HTTP Input will fail to work.
    urlBuilder.appendPath(encodeURIComponent(containerName));
    urlBuilder.appendPath(encodeURIComponent(blobPath));

    return urlBuilder.toString();
}

export async function listBlobsInContainer(container: string, pageSize: number, extensions?: string[], continuationToken?: string): Promise<BlobMatches | undefined> {

    let containerClient = client.getContainerClient(container);

    let i = 0;
    let blobList: BlobItem[] = [];
    let blobMatches: BlobMatches;
    let iterator: AsyncIterableIterator<ContainerListBlobFlatSegmentResponse>;
    let response: ContainerListBlobFlatSegmentResponse

    if (continuationToken == '') {
        continuationToken = undefined;
    }

    try {
        iterator = containerClient.listBlobsFlat({includeMetadata:true}).byPage({ maxPageSize: pageSize, continuationToken: continuationToken });
        response = (await iterator.next()).value;

        if (response.errorCode !== undefined)
            throw (new Error(response.errorCode));

        // Scan for blobs which match the extensions
        for (const blob of response.segment.blobItems) {

            // If this blob already has metadata saying it was encoded by AMS, skip it. 
            if (blob.metadata) {
                if (blob.metadata["ams_encoded"] == "true") {
                    console.log(`Blob ${blob.name} already encoded by AMS, skipping.`);
                    continue;
                }
            }

            if (extensions !== undefined) {
                extensions.forEach(element => {
                    if (blob.name.indexOf(element) > -1) {
                        console.log(`Found blob ${blob.name} with extension:${element} in container:${container}`)
                        blobList.push(blob);
                        i++

                    }
                });
            }
        }

        blobMatches = {
            blobItems: blobList,
            matchCount: i,
            continuationToken: response.continuationToken,
            marker: response.marker,
            errorCode: response.errorCode
        }

        return blobMatches;

    } catch (err) {
        console.error("ERROR: in listBlobsInContainer - iterator.next()")
        console.error(err);
    }

    return;

}


export interface BlobMatches {
    blobItems: BlobItem[];
    matchCount: number;
    continuationToken: string | undefined;
    marker: string | undefined;
    errorCode: string | undefined
}