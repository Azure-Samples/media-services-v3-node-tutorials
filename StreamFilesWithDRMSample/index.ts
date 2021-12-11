// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices,
  BuiltInStandardEncoderPreset,
  AssetContainerPermission,
  JobOutputAsset,
  JobInputUnion,
  JobsGetResponse,
  ContentKeyPoliciesGetResponse,
  ContentKeyPoliciesCreateOrUpdateResponse,
  ContentKeyPolicySymmetricTokenKey,
  ContentKeyPolicyTokenClaim,
  ContentKeyPolicyTokenRestriction,
  ContentKeyPolicyOption,
  ContentKeyPolicyPlayReadyConfiguration,
  ContentKeyPolicyWidevineConfiguration,
} from '@azure/arm-mediaservices';
import {
  BlobServiceClient,
  AnonymousCredential
} from "@azure/storage-blob";
import { TransformFactory }  from "../Common/Encoding/TransformFactory";
import { AbortController } from "@azure/abort-controller";
import { v4 as uuidv4 } from 'uuid';
import * as path from "path";
import * as url from 'whatwg-url';
import * as util from 'util';
import * as fs from 'fs';
// Load the .env file if it exists
import * as dotenv from "dotenv";
// jsonwebtoken package used for signing JWT test tokens in this sample
import * as jsonWebToken from "jsonwebtoken";
// moment used for manipulation of dates and times for JWT token expirations
import moment from 'moment';
moment().format();

dotenv.config();

// This is the main Media Services client object
let mediaServicesClient: AzureMediaServices;

// Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
// from your Media Services account's API Access page in the Azure portal.
const clientId: string = process.env.AADCLIENTID as string;
const secret: string = process.env.AADSECRET as string;
const tenantDomain: string = process.env.AADTENANTDOMAIN as string;
const subscriptionId: string = process.env.SUBSCRIPTIONID as string;
const resourceGroup: string = process.env.RESOURCEGROUP as string;
const accountName: string = process.env.ACCOUNTNAME as string;

// This sample uses the default Azure Credential object, which relies on the environment variable settings.
// If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
// Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
// https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
// See the following examples for how to authenticate in Azure with managed identity
// https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 

// const credential = new ManagedIdentityCredential("<USER_ASSIGNED_MANAGED_IDENTITY_CLIENT_ID>");
const credential = new DefaultAzureCredential();

// You can either specify a local input file with the inputFile or an input Url with inputUrl. 
// Just set the other one to null to have it select the right JobInput class type

// const inputFile = "Media\\<<yourfilepath.mp4>>"; // Place your media in the /Media folder at the root of the samples. Code for upload uses relative path to current working directory for Node;
let inputFile: string;
// This is a hosted sample file to use
let inputUrl: string = "https://amssamples.streaming.mediaservices.windows.net/2e91931e-0d29-482b-a42b-9aadc93eb825/AzurePromo.mp4";

// Timer values
const timeoutSeconds: number = 60 * 10;
const sleepInterval: number = 1000 * 2;
const setTimeoutPromise = util.promisify(setTimeout);

// Args
const outputFolder: string = "./Output";
const namePrefix: string = "streamDRM";
let inputExtension: string;
let blobName: string;

// DRM Configuration Settings
const issuer: string = "myIssuer";
const audience: string = "myAudience";
let tokenSigningKey: Int16Array = new Int16Array(40);
const contentKeyPolicyName = "CommonEncryptionCencDrmContentKeyPolicy_2021_11_23";
const symmetricKey: string = process.env.DRMSYMMETRICKEY as string;

///////////////////////////////////////////
//   Main entry point for sample script  //
///////////////////////////////////////////
export async function main() {
  // Define the name to use for the encoding Transform that will be created
  const encodingTransformName = "ContentAwareEncodingTransform";

  mediaServicesClient = new AzureMediaServices(credential, subscriptionId, {});

  try {
    // Ensure that you have the desired encoding Transform. This is really a one time setup operation.
    console.log("Creating encoding transform...");

    // Create a new Transform using a preset name from the list of built in encoding presets. 
    // To use a custom encoding preset, you can change this to be a StandardEncoderPreset, which has support for codecs, formats, and filter definitions.
    // This sample uses the 'ContentAwareEncoding' preset which chooses the best output based on an analysis of the input video.
    let adaptiveStreamingTransform: BuiltInStandardEncoderPreset = TransformFactory.createBuiltInStandardEncoderPreset({
      presetName: "ContentAwareEncoding"
    });

    let encodingTransform = await mediaServicesClient.transforms.createOrUpdate(resourceGroup, accountName, encodingTransformName, {
      name: encodingTransformName,
      outputs: [
        {
          preset: adaptiveStreamingTransform
        }
      ]
    });
    console.log("Transform Created (or updated if it existed already).");

    let uniqueness = uuidv4();
    let input = await getJobInputType(uniqueness);
    let outputAssetName = `${namePrefix}-output-${uniqueness}`;
    let jobName = `${namePrefix}-job-${uniqueness}`;
    let locatorName = `locator${uniqueness}`;

    console.log("Creating the output Asset to encode content into...");
    let outputAsset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, outputAssetName, {});

    if (outputAsset.name !== undefined) {
      console.log("Submitting the encoding job to the Transform's job queue...");
      let job = await submitJob(encodingTransformName, jobName, input, outputAsset.name);

      console.log(`Waiting for Job - ${job.name} - to finish encoding`);
      job = await waitForJobToFinish(encodingTransformName, jobName);

      if (job.state == "Finished") {
        await downloadResults(outputAsset.name as string, outputFolder);
      }

      // Set a token signing key that you want to use from the env file
      // WARNING: This is an important secret when moving to a production system and should be kept in a Key Vault.
      let tokenSigningKey = new Uint8Array(Buffer.from(symmetricKey, 'base64'));

      // Create the content key policy that configures how the content key is delivered to end clients
      // via the Key Delivery component of Azure Media Services.
      // We are using the ContentKeyIdentifierClaim in the ContentKeyPolicy which means that the token presented
      // to the Key Delivery Component must have the identifier of the content key in it. 
      await createOrUpdateContentKeyPolicy(contentKeyPolicyName, tokenSigningKey);

      let locator = await createStreamingLocator(outputAsset.name, locatorName, contentKeyPolicyName);

      let keyIdentifier: string;
      // In order to generate our test token we must get the ContentKeyId from the streaming locator to put in the ContentKeyIdentifierClaim claim used when creating the JWT test token 

      // We are using the ContentKeyIdentifierClaim in the ContentKeyPolicy which means that the token presented
      // to the Key Delivery Component must have the identifier of the content key in it.  Since we didn't specify
      // a content key when creating the StreamingLocator, the service created a random GUID for us.  In order to 
      // generate our JWT test token we must get the ContentKeyId to put in the ContentKeyIdentifierClaim claim.

      if (locator.contentKeys !== undefined) {
        keyIdentifier = locator.contentKeys[0].id;
        console.log(`The ContentKey for this streaming locator is : ${keyIdentifier}`);

      } else throw new Error("Locator and content keys are undefined.")

      let token: string = await getToken(issuer, audience, keyIdentifier, tokenSigningKey);

      console.log(`The JWT token used is : ${token}`);
      console.log("You can decode the token using a tool like https://www.jsonwebtoken.io/ with the symmetric encryption key to view the decoded results.");

      if (locator.name !== undefined) {
        let urls = await getStreamingUrls(locator.name, token);
      } else throw new Error("Locator was not created or Locator.name is undefined");

    }

  } catch (err) {
    console.log(err);
  }

}

main().catch((err) => {
  console.error("Error running sample:", err.message);
});

async function downloadResults(assetName: string, resultsFolder: string) {
  let date = new Date();
  let readPermission: AssetContainerPermission = "Read";

  date.setHours(date.getHours() + 1);
  let input = {
    permissions: readPermission,
    expiryTime: date
  }
  let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, input);

  if (listContainerSas.assetContainerSasUrls) {
    let containerSasUrl = listContainerSas.assetContainerSasUrls[0];
    let sasUri = url.parseURL(containerSasUrl);

    // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
    const anonymousCredential = new AnonymousCredential();
    let blobClient = new BlobServiceClient(containerSasUrl, anonymousCredential)
    // We need to get the containerName here from the SAS URL path to use later when creating the container client
    let containerName = sasUri?.path[0];
    let directory = path.join(resultsFolder, assetName);
    console.log(`Downloading output into ${directory}`);

    // Get the blob container client using the container name on the SAS URL path
    // to access the blockBlobClient needed to use the uploadFile method
    let containerClient = blobClient.getContainerClient('');

    try {
      fs.mkdirSync(directory, { recursive: true });
    } catch (err) {
      // directory exists
      console.log(err);
    }
    console.log(`Listing blobs in container ${containerName}...`);
    console.log("Downloading blobs to local directory in background...");
    let i = 1;
    for await (const blob of containerClient.listBlobsFlat()) {
      console.log(`Blob ${i++}: ${blob.name}`);

      let blockBlobClient = containerClient.getBlockBlobClient(blob.name);
      await blockBlobClient.downloadToFile(path.join(directory, blob.name), 0, undefined,
        {
          abortSignal: AbortController.timeout(30 * 60 * 1000),
          maxRetryRequests: 2,
          onProgress: (ev) => console.log(ev)
        }).then(() => {
          console.log(`Download file complete`);
        });

    }
  }
}

async function waitForJobToFinish(transformName: string, jobName: string) {
  let timeout = new Date();
  timeout.setSeconds(timeout.getSeconds() + timeoutSeconds);

  async function pollForJobStatus(): Promise<JobsGetResponse> {
    let job = await mediaServicesClient.jobs.get(resourceGroup, accountName, transformName, jobName);
    // Note that you can report the progress for each Job output if you have more than one. In this case, we only have one output in the Transform
    // that we defined in this sample, so we can check that with the job.outputs[0].progress parameter.
    if (job.outputs != undefined) {
      console.log(`Job State is : ${job.state},  Progress: ${job.outputs[0].progress}%`);
    }

    if (job.state == 'Finished' || job.state == 'Error' || job.state == 'Canceled') {

      return job;
    } else if (new Date() > timeout) {
      console.log(`Job ${job.name} timed out. Please retry or check the source file. Stop the debugger manually here.`);
      return job;
    } else {
      await setTimeoutPromise(sleepInterval, null);
      return pollForJobStatus();
    }
  }

  return await pollForJobStatus();
}



// Selects the JobInput type to use based on the value of inputFile or inputUrl. 
// Set inputFile to null to create a Job input that sources from an HTTP URL path
// Creates a new input Asset and uploads the local file to it before returning a JobInputAsset object
// Returns a JobInputHttp object if inputFile is set to null, and the inputUrl is set to a valid URL
async function getJobInputType(uniqueness: string): Promise<JobInputUnion> {
  if (inputFile !== undefined) {
    let assetName: string = namePrefix + "-input-" + uniqueness;
    await createInputAsset(assetName, inputFile);
    return TransformFactory.createJobInputAsset({
      assetName: assetName
    })
  } else {
    return TransformFactory.createJobInputHttp({
      files: [inputUrl]
    })
  }
}

// Creates a new Media Services Asset, which is a pointer to a storage container
// Uses the Storage Blob npm package to upload a local file into the container through the use 
// of the SAS URL obtained from the new Asset object.  
// This demonstrates how to upload local files up to the container without require additional storage credential.
async function createInputAsset(assetName: string, fileToUpload: string) {
  let uploadSasUrl: string;
  let fileName: string;
  let sasUri: url.URLRecord | null;

  let asset = await mediaServicesClient.assets.createOrUpdate(resourceGroup, accountName, assetName, {});
  let date = new Date();
  let readWritePermission: AssetContainerPermission = "ReadWrite";

  date.setHours(date.getHours() + 1);
  let input = {
    permissions: readWritePermission,
    expiryTime: date
  }

  let listContainerSas = await mediaServicesClient.assets.listContainerSas(resourceGroup, accountName, assetName, input);
  if (listContainerSas.assetContainerSasUrls) {
    uploadSasUrl = listContainerSas.assetContainerSasUrls[0];
    fileName = path.basename(fileToUpload);
    sasUri = url.parseURL(uploadSasUrl);

    // Get the Blob service client using the Asset's SAS URL and the Anonymous credential method on the Blob service client
    const anonymousCredential = new AnonymousCredential();
    let blobClient = new BlobServiceClient(uploadSasUrl, anonymousCredential)
    // We need to get the containerName here from the SAS URL path to use later when creating the container client
    let containerName = sasUri?.path[0];
    console.log(`Uploading file named ${fileName} to blob in the Asset's container...`);

    // Get the blob container client using the empty string to use the same container as the SAS URL points to.
    // Otherwise, adding a name here creates a sub folder, which will break the encoder. 
    let containerClient = blobClient.getContainerClient('');
    // Next gets the blockBlobClient needed to use the uploadFile method
    let blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Parallel uploading with BlockBlobClient.uploadFile() in Node.js runtime
    // BlockBlobClient.uploadFile() is only available in Node.js and not in Browser
    await blockBlobClient.uploadFile(fileToUpload, {
      blockSize: 4 * 1024 * 1024, // 4MB Block size
      concurrency: 20, // 20 concurrent
      onProgress: (ev) => console.log(ev)
    });
  }

  return asset;
}


async function submitJob(transformName: string, jobName: string, jobInput: JobInputUnion, outputAssetName: string) {
  if (outputAssetName == undefined) {
    throw new Error("OutputAsset Name is not defined. Check creation of the output asset");
  }
  let jobOutputs: JobOutputAsset[] = [
    TransformFactory.createJobOutputAsset({
      assetName: outputAssetName
    })
  ];

  return await mediaServicesClient.jobs.create(resourceGroup, accountName, transformName, jobName, {
    input: jobInput,
    outputs: jobOutputs
  });

}

// Create a new Content Key Policy using Widevine DRM and Playready DRM configurations.

async function createOrUpdateContentKeyPolicy(policyName: string, tokenSigningKey: Uint8Array) {
  let contentKeyPoliciesGetResponse: ContentKeyPoliciesGetResponse;
  let contentKeyPolicy: ContentKeyPoliciesCreateOrUpdateResponse;
  let options: ContentKeyPolicyOption[] = [];

  let primaryKey: ContentKeyPolicySymmetricTokenKey = {
    odataType: "#Microsoft.Media.ContentKeyPolicySymmetricTokenKey",
    keyValue: tokenSigningKey,
  }

  let requiredClaims: ContentKeyPolicyTokenClaim[] = [
    {
      claimType: "urn:microsoft:azure:mediaservices:contentkeyidentifier" // contentKeyIdentifierClaim
    }
  ];

  let restriction: ContentKeyPolicyTokenRestriction = {
    odataType: "#Microsoft.Media.ContentKeyPolicyTokenRestriction",
    issuer: issuer,
    audience: audience,
    primaryVerificationKey: primaryKey,
    restrictionTokenType: "Jwt",
    alternateVerificationKeys: undefined,
    requiredClaims: requiredClaims
  }


  //ContentKeyPolicyPlayReadyConfiguration playReadyConfig = ConfigurePlayReadyLicenseTemplate();

  //   Creates a PlayReady License Template with the following settings
  //    - sl2000
  //    - license type = non-persistent
  //    - content type = unspecified
  //    - Uncompressed Digital Video OPL = 270
  //    - Compressed Digital Video OPL  = 300
  //    - Explicit Analog Television Protection =  best effort
  let playreadyConfig: ContentKeyPolicyPlayReadyConfiguration = {
    odataType: "#Microsoft.Media.ContentKeyPolicyPlayReadyConfiguration",
    licenses: [
      {
        allowTestDevices: true,
        contentKeyLocation: {
          odataType: "#Microsoft.Media.ContentKeyPolicyPlayReadyContentEncryptionKeyFromHeader"
        },
        playRight: {
          allowPassingVideoContentToUnknownOutput: "Allowed",
          imageConstraintForAnalogComponentVideoRestriction: true,
          digitalVideoOnlyContentRestriction: false,
          uncompressedDigitalVideoOpl: 270,
          compressedDigitalVideoOpl: 400,
          imageConstraintForAnalogComputerMonitorRestriction: false,
          explicitAnalogTelevisionOutputRestriction: {
            bestEffort: true,
            configurationData: 2
          }
        },
        licenseType: "NonPersistent",
        contentType: "Unspecified"
      }
    ],
    responseCustomData: undefined
  }

  // Configure the WideVine license template in JSON
  // See the latest documentation and Widevine docs by Google for details
  // https://docs.microsoft.com/azure/media-services/latest/widevine-license-template-overview 
  let wideVineConfig: ContentKeyPolicyWidevineConfiguration = {
    odataType: "#Microsoft.Media.ContentKeyPolicyWidevineConfiguration",
    widevineTemplate: JSON.stringify({
      allowed_track_types: "SD_HD",
      content_key_specs: [
        {
          track_type: "SD",
          security_level: 1,
          required_output_protection: {
            HDCP: "HDCP_NONE"
            // NOTE: the policy should be set to "HDCP_v1" (or greater) if you need to disable screen capture. The Widevine desktop
            // browser CDM module only blocks screen capture when HDCP is enabled and the screen capture application is using
            // Chromes screen capture APIs. 
          }
        }
      ],
      policy_overrides: {
        can_play: true,
        can_persist: false,
        can_renew: false,
        // Additional OPTIONAL settings in Widevine template, depending on your use case scenario
        // license_duration_seconds: 604800,
        // rental_duration_seconds: 2592000,
        // playback_duration_seconds: 10800,
        // renewal_recovery_duration_seconds: <renewal recovery duration in seconds>,
        // renewal_server_url: "<renewal server url>",
        // renewal_delay_seconds: <renewal delay>,
        // renewal_retry_interval_seconds: <renewal retry interval>,
        // renew_with_usage: <renew with usage>
      }
    })
  }

  // Add the two license type configurations for PlayReady and Widevine to the policy
  options = [
    {
      configuration: playreadyConfig,
      restriction: restriction
    },
    {
      configuration: wideVineConfig,
      restriction: restriction
    },
  ];

  await mediaServicesClient.contentKeyPolicies.createOrUpdate(resourceGroup, accountName, policyName, {
    description: "Content Key Policy Description",
    options: options
  });


}

async function createStreamingLocator(assetName: string, locatorName: string, contentKeyPolicyName: string) {
  let streamingLocator = {
    assetName: assetName,
    streamingPolicyName: "Predefined_MultiDrmCencStreaming", // Uses the built in Policy for Multi DRM Common Encryption Streaming.
    defaultContentKeyPolicyName: contentKeyPolicyName
  };

  let locator = await mediaServicesClient.streamingLocators.create(
    resourceGroup,
    accountName,
    locatorName,
    streamingLocator);

  return locator;
}

async function getStreamingUrls(locatorName: string, token: string) {
  // Make sure the streaming endpoint is in the "Running" state on your account
  let streamingEndpoint = await mediaServicesClient.streamingEndpoints.get(resourceGroup, accountName, "default");

  let paths = await mediaServicesClient.streamingLocators.listPaths(resourceGroup, accountName, locatorName);
  if (paths.streamingPaths) {
    paths.streamingPaths.forEach(path => {
      path.paths?.forEach(formatPath => {
        let manifestPath = "https://" + streamingEndpoint.hostName + formatPath
        console.log(manifestPath);
        console.log("IMPORTANT!! For all DRM Samples to work, you must use an HTTPS hosted player page. This could drive you insane if you miss this point.");
        console.log("For Widevine testing, please open the link in the Chrome Browser.");
        console.log(`Click to playback in AMP player: https://ampdemo.azureedge.net/?url=${manifestPath}&playready=true&widevine=true&token=Bearer%20${token}`)
      });
    });
  }
}

async function getToken(issuer: string, audience: string, keyIdentifier: string, tokenSigningKey: Uint8Array): Promise<any> {
  let startDate: number = moment().subtract(5, "minutes").unix()  // Get the current time and subtract 5 minutes, then return as a Unix timestamp
  let endDate: number = moment().add(1, "day").unix() // Expire the token in 1 day, return Unix timestamp.

  // To set a limit on how many times the same token can be used to request a key or a license.
  // add  the "urn:microsoft:azure:mediaservices:maxuses" claim.
  // For example, "urn:microsoft:azure:mediaservices:maxuses", 2));

  let claims = {
    "urn:microsoft:azure:mediaservices:contentkeyidentifier": keyIdentifier,
    // "urn:microsoft:azure:mediaservices:maxuses": 2 // optional feature for token replay prevention
    "exp": endDate,
    "nbf": startDate
  }

  let jwtToken = jsonWebToken.sign(
    claims,
    Buffer.from(tokenSigningKey),
    {
      algorithm: "HS256",
      issuer: issuer,
      audience: audience,
    }
  );

  return jwtToken;
}