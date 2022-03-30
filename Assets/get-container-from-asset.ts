// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

//  This sample demonstrates how to ge the container name from any Asset.  It can be in input or output asset from an encoding job
//  Note that this sample also demonstrates how to name the container on creation. 

import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices
} from '@azure/arm-mediaservices';

// Load the .env file if it exists
import * as dotenv from "dotenv";
dotenv.config();

export async function main() {
  // Copy the samples.env file and rename it to .env first, then populate it's values with the values obtained 
  // from your Media Services account's API Access page in the Azure portal.
  const clientId: string = process.env.AZURE_CLIENT_ID as string;
  const secret: string = process.env.AZURE_CLIENT_SECRET as string;
  const subscriptionId: string = process.env.AZURE_SUBSCRIPTION_ID as string;
  const resourceGroup: string = process.env.AZURE_RESOURCE_GROUP as string;
  const accountName: string = process.env.AZURE_MEDIA_SERVICES_ACCOUNT_NAME as string;


  // This sample uses the default Azure Credential object, which relies on the environment variable settings.
  // If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
  // Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
  // https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
  // See the following examples for how to authenticate in Azure with managed identity
  // https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 

  // const credential = new ManagedIdentityCredential("<USER_ASSIGNED_MANAGED_IDENTITY_CLIENT_ID>");
  const credential = new DefaultAzureCredential();

  let mediaServicesClient =  new AzureMediaServices(credential, subscriptionId)

  // List Assets in Account
  console.log("Listing assets in account:")

  let assetName = "MyCustomAssetName";
  let storageContainerName = "mycustomcontainername"; // Lower case, numbers and dashes are ok. Check MSDN for more information about valid container naming

  console.log(`Creating a new Asset with the name : ${assetName} in storage container ${storageContainerName}`);

  let asset = await mediaServicesClient.assets.createOrUpdate(resourceGroup,accountName, assetName, {
    container:storageContainerName,
    alternateId: "MyCustomIdentifier",
    description: "my description",
    // storageAccountName: ""  // This is optional, if you have more than one storage account connected to the AMS account, you can specify which account to use
  }) 

  console.log(`Asset created!`);

  console.log(`This Asset is in storage account : ${asset.storageAccountName} in the container: ${asset.container}`);

  console.log('Deleting Asset');
  await mediaServicesClient.assets.delete(resourceGroup, accountName, assetName);
  console.log(`Asset is now deleted`);
}

main().catch((err) => {
    
  console.error("Error running sample:", err.message);
  console.error (`Error code: ${err.code}`);

  if (err.name == 'RestError'){
      // REST API Error message
      console.error("Error request:\n\n", err.request);
  }

});