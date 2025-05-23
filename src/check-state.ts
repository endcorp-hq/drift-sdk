import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  AdminClient,
  getSpotMarketPublicKey,
} from "@drift-labs/sdk";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the keypair from file
  const keypairData = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), process.env.ADMIN_PRIVATE_KEY_PATH!), "utf-8")
  );
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  
  console.log("Your wallet public key:", keypair.publicKey.toBase58());

  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => {
      tx.sign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      return txs.map((tx) => {
        tx.sign(keypair);
        return tx;
      });
    },
  };

  // Program ID
const programId = new PublicKey(process.env.PROGRAM_ID!);

  // Initialize AdminClient
  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: programId,
    opts: {
      commitment: "confirmed",
    },
  });

  try {
    // Subscribe to the client
    await adminClient.subscribe();

    // Get the state account
    const stateAccount = await adminClient.getStateAccount();
    const statePublicKey = await adminClient.getStatePublicKey();
    
    console.log("\n=== State Account Details ===");
    console.log("State Account Public Key:", statePublicKey.toBase58());
    console.log("Number of Markets:", stateAccount.numberOfMarkets);
    console.log("Number of Spot Markets:", stateAccount.numberOfSpotMarkets);
    
    // Get state account info
    const stateAccountInfo = await connection.getAccountInfo(statePublicKey);
    console.log("\nState Account Info:");
    console.log("- Exists:", stateAccountInfo !== null);
    console.log("- Size:", stateAccountInfo?.data.length || 0, "bytes");
    console.log("- Owner:", stateAccountInfo?.owner.toBase58());
    
    // Check spot market at index 0
    const spotMarketPublicKey = await getSpotMarketPublicKey(
      adminClient.program.programId,
      0
    );
    
    console.log("\n=== Spot Market Details (Index 0) ===");
    console.log("Spot Market Public Key:", spotMarketPublicKey.toBase58());
    
    // Get spot market account info
    const spotMarketInfo = await connection.getAccountInfo(spotMarketPublicKey);
    console.log("\nSpot Market Info:");
    console.log("- Exists:", spotMarketInfo !== null);
    console.log("- Size:", spotMarketInfo?.data.length || 0, "bytes");
    console.log("- Owner:", spotMarketInfo?.owner.toBase58());
    
    if (spotMarketInfo) {
      try {
        const spotMarketAccount = adminClient.getSpotMarketAccount(0);
        if (spotMarketAccount) {
          console.log("\nSpot Market Configuration:");
          console.log("- Mint:", spotMarketAccount.mint.toBase58());
          console.log("- Oracle:", spotMarketAccount.oracle.toBase58());
          console.log("- Oracle Source:", spotMarketAccount.oracleSource);
          console.log("- Status:", spotMarketAccount.status);
        }
      } catch (error: any) {
        console.log("\nCould not load spot market account data:", error.message);
      }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Unsubscribe when done
    await adminClient.unsubscribe();
  }
}

main().catch(console.error); 