// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
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

  let mediaServicesClient =  new AzureMediaServices(credential, subscriptionId)

  // List Assets in Account
  console.log("Listing assets in account:")
  for await (const asset of mediaServicesClient.assets.list(resourceGroup, accountName, { top:1000 })){
    console.log(asset.name);
  }

}

main().catch((err) => {
    
  console.error("Error running sample:", err.message);
  console.error (`Error code: ${err.code}`);

  if (err.name == 'RestError'){
      // REST API Error message
      console.error("Error request:\n\n", err.request);
  }

});