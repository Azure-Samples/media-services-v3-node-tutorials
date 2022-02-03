// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// 
// There are three scenarios where Managed Identities can be used with Media Services:
// 
// 1) Granting a Media Services account access to Key Vault to enable Customer Managed Keys
// 2) Granting a Media Services account access to storage accounts to allow Media Services to bypass Azure Storage Network ACLs
// 3) Allowing other services (for example, VMs or Azure Functions) to access Media Services
//
// This sample demonstrates creating an AMS account for scenario #2.  You can modify this sample to support scenario #1 as well, just uncomment the code sections required and provide the resource information for key vault. 
// Scenario 3 would be handled through the Azure Portal or CLI. 
// For more information read the article - https://docs.microsoft.com/azure/media-services/latest/concept-managed-identities 
// 

import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
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
  const clientId: string = process.env.AZURE_CLIENT_ID as string;
  const secret: string = process.env.AZURE_CLIENT_SECRET as string;
  const subscriptionId: string = process.env.AZURE_SUBSCRIPTION_ID as string;
  const resourceGroup: string = process.env.AZURE_RESOURCE_GROUP as string;
  const storageAccountName: string = process.env.AZURE_STORAGE_ACCOUNT_NAME as string;
  const managedIdentityName: string = process.env.AZURE_USER_ASSIGNED_IDENTITY as string;

  // This sample uses the default Azure Credential object, which relies on the environment variable settings.
  // If you wish to use User assigned managed identity, see the samples for v2 of @azure/identity
  // Managed identity authentication is supported via either the DefaultAzureCredential or the ManagedIdentityCredential classes
  // https://docs.microsoft.com/javascript/api/overview/azure/identity-readme?view=azure-node-latest
  // See the following examples for how to authenticate in Azure with managed identity
  // https://github.com/Azure/azure-sdk-for-js/blob/@azure/identity_2.0.1/sdk/identity/identity/samples/AzureIdentityExamples.md#authenticating-in-azure-with-managed-identity 

  // const credential = new ManagedIdentityCredential("<USER_ASSIGNED_MANAGED_IDENTITY_CLIENT_ID>");
  const credential = new DefaultAzureCredential();

  let mediaServicesClient = new AzureMediaServices(credential, subscriptionId)

  let uniqueness:string = uuidv4().split('-')[0]; // Create a GUID for uniqueness 
  const accountName :string = "testaccount" + uniqueness;
  const managedIdentityResource :string = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${managedIdentityName}`;
  const managedIdentityProperty :string = `"` + managedIdentityResource + `"`;

  // Set this to one of the available region names using the format japanwest,japaneast,eastasia,southeastasia,
  // westeurope,northeurope,eastus,westus,australiaeast,australiasoutheast,eastus2,centralus,brazilsouth,
  // centralindia,westindia,southindia,northcentralus,southcentralus,uksouth,ukwest,canadacentral,canadaeast,
  // westcentralus,westus2,koreacentral,koreasouth,francecentral,francesouth,southafricanorth,southafricawest,
  // uaecentral,uaenorth,germanywestcentral,germanynorth,switzerlandwest,switzerlandnorth,norwayeast

  const accountLocation :string = "westus2";

  if (storageAccountName === undefined)
    throw ({ message: "No storage account name provided in .env file" });

  // Set up the values for your Media Services account 
  let parameters: MediaService = {
    location: accountLocation,
    storageAccounts: [
      {
        // This should point to an already created storage account that is Blob storage General purpose v2. Recommend to use ZRS or Geo redundant ZRS in regions that support availability zones
        type: KnownStorageAccountType.Primary,
        id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/microsoft.storage/storageAccounts/${storageAccountName}`,
        // Set the use assigned managed identity resource and set system assigned to false here. 
        identity: {
          userAssignedIdentity: managedIdentityResource,
          useSystemAssignedIdentity: false
        }
      }
    ],
    // Sets the account encryption used.  This can be changed to customer key and point to a key vault key. 
    encryption: {
      type: "SystemKey",
      // Optional settings if using key vault encryption key and managed identity
      /*identity: { 
        userAssignedIdentity: managedIdentityResource, 
        useSystemAssignedIdentity: false },
      keyVaultProperties: {
        currentKeyIdentifier: "",
        keyIdentifier: ""
      }*/
    },
    // Enables user or system assigned managed identity when accessing storage - a.k.a - trusted storage. 
    storageAuthentication: "ManagedIdentity",

    identity:{
      type: "UserAssigned",
      userAssignedIdentities: {
        [managedIdentityResource] : {}
      }
    },
    // If you plan to use a private network and do not want any streaming to go out to the public internet, you can disable this account setting. 
    publicNetworkAccess : "Enabled",
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
    throw ({ message: availability.message });
  }

  // Create a new Media Services account
  let response = await mediaServicesClient.mediaservices.createOrUpdate(resourceGroup, accountName, parameters);

  console.log(`Successfully created account ${response.name}`)

}

main().catch((err) => {

  console.error("Error running sample:", err.message);
  console.error(`Error code: ${err.code}`);

  if (err.name == 'RestError') {
    // REST API Error message
    console.error("Error request:\n\n", err.request);
  }

});