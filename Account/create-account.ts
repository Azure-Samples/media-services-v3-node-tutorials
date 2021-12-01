// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DefaultAzureCredential } from "@azure/identity";
import {
  AzureMediaServices, 
  KnownDefaultAction, 
  KnownStorageAccountType, 
  MediaService
} from '@azure/arm-mediaservices';
import { v4 as uuidv4 } from 'uuid';

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
  const storageAccountName: string = process.env.STORAGEACCOUNTNAME as string;

  // This sample uses the default Azure Credential object, which relies on the environment variable settings.
  // If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
  // Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
  // https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
  // See the following examples for how ot authenticate in Azure with managed identity
  // https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 

  // const credential = new ManagedIdentityCredential("<USER_ASSIGNED_MANAGED_IDENTITY_CLIENT_ID>");
  const credential = new DefaultAzureCredential();

  let mediaServicesClient = new AzureMediaServices(credential, subscriptionId)

  let uniqueness = uuidv4().split('-')[0]; // Create a GUID for uniqueness 
  const accountName = "testaccount" + uniqueness;

  // Set this to one of the available region names using the format japanwest,japaneast,eastasia,southeastasia,
  // westeurope,northeurope,eastus,westus,australiaeast,australiasoutheast,eastus2,centralus,brazilsouth,
  // centralindia,westindia,southindia,northcentralus,southcentralus,uksouth,ukwest,canadacentral,canadaeast,
  // westcentralus,westus2,koreacentral,koreasouth,francecentral,francesouth,southafricanorth,southafricawest,
  // uaecentral,uaenorth,germanywestcentral,germanynorth,switzerlandwest,switzerlandnorth,norwayeast

  const accountLocation = "westus";

  if (storageAccountName === undefined) 
    throw ({message:"No storage account name provided in .env file"});

  // Set up the values for your Media Services account 
  let parameters: MediaService = {
    location: accountLocation,
    storageAccounts: [
      {
        type: KnownStorageAccountType.Primary,
        id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}"`
      }
    ],
    keyDelivery: {
      accessControl: {
        defaultAction: KnownDefaultAction.Allow,
        ipAllowList: [
          // List the IPv3 addresses to Allow or Deny based on the default action. 
          // "10.0.0.1/32", // you can use the CIDR IPv3 format,
          // "127.0.0.1"  or a single individual Ipv4 address as well.
        ]
      }
    }
  }

  var availability = await mediaServicesClient.locations.checkNameAvailability(
    accountLocation, 
    { 
      name: accountName, 
      type: "Microsoft.Media/mediaservices" 
    }
  )

  if (!availability.nameAvailable) {
    console.log(`The account with the name ${accountName} is not available.`);
    console.log(availability.message);
    throw({message:availability.message});
  }

   // Create a new Media Services account
   mediaServicesClient.mediaservices.createOrUpdate(resourceGroup, accountName, parameters);


}

main().catch((err) => {
  console.error("Error running sample:", err.message);
});