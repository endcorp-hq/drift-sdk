import { Connection, Keypair, PublicKey, Transaction, SendTransactionError } from "@solana/web3.js";
import {
  AdminClient,
  BN,
  BASE_PRECISION,
  PRICE_PRECISION,
  ONE,
  ZERO,
  OracleSource,
  AssetTier,
} from "@drift-labs/sdk";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Connect to devnet
  const connection = new Connection("https://api.devnet.solana.com");

  // Load the keypair from file
  const keypairData = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../keypair.json"), "utf-8")
  );
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));

  const wallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      tx.sign(keypair);
      return tx;
    },
    signAllTransactions: async (txs: Transaction[]) => {
      return txs.map((tx) => {
        tx.sign(keypair);
        return tx;
      });
    },
  };

  // Initialize AdminClient
  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: new PublicKey("EpNqZ7KyCuW9yJb7hNAvqchB6S5oSCNpQhpmnNZDYwUJ"),
    opts: {
      commitment: "confirmed",
    },
  });

  try {
    // Subscribe to the client
    await adminClient.subscribe();

    const state = adminClient.getStateAccount();
    
    // Get the current number of markets
    const marketIndex = state.numberOfMarkets;
    console.log("USDC spot market index:", marketIndex);

    // USDC mint address on devnet
    const usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

    // For USDC spot market, we must use default public key as oracle when using QuoteAsset
    const usdcOracle = PublicKey.default;

    console.log("Initializing spot market with parameters:");
    console.log("- Market Index:", marketIndex);
    console.log("- USDC Mint:", usdcMint.toBase58());
    console.log("- Oracle:", usdcOracle.toBase58());
    console.log("- Oracle Source: QUOTE_ASSET");

    // Initialize spot market
    const ixs = await adminClient.getInitializeSpotMarketIx(
      usdcMint, // mint
      0.8, // optimalUtilization (80%)
      0.1, // optimalRate (10%)
      0.2, // maxRate (20%)
      usdcOracle, // oracle (must be default for QuoteAsset)
      OracleSource.QUOTE_ASSET, // oracleSource (must be QuoteAsset for USDC)
      1.0, // initialAssetWeight (100%)
      1.0, // maintenanceAssetWeight (100%)
      1.0, // initialLiabilityWeight (100%)
      1.0, // maintenanceLiabilityWeight (100%)
      0, // imfFactor
      0, // liquidatorFee
      0, // ifLiquidationFee
      true, // activeStatus
      AssetTier.COLLATERAL, // assetTier
      ZERO, // scaleInitialAssetWeightStart
      ZERO, // withdrawGuardThreshold
      PRICE_PRECISION.divn(100000), // orderTickSize
      BASE_PRECISION.divn(10000), // orderStepSize
      0, // ifTotalFactor
      "U", // name
      marketIndex // marketIndex
    );

    // Build the transaction
    console.log("Building transaction...");
    const tx = new Transaction();
    tx.add(ixs);
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // Send the transaction
    console.log("Sending transaction...");
    try {
      const txSig = await connection.sendTransaction(tx, [keypair], {
        skipPreflight: false, // Enable preflight checks
        preflightCommitment: "confirmed",
      });
      console.log("Transaction sent:", txSig);

      // Wait for confirmation
      console.log("Waiting for confirmation...");
      const confirmation = await adminClient.connection.confirmTransaction(txSig);
      console.log("Transaction confirmed!", confirmation);
      console.log("USDC spot market initialized!");
    } catch (error) {
      console.error("Transaction failed:", error);
      if (error instanceof SendTransactionError) {
        console.error("Error details:", error.message);
      }
      throw error;
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Unsubscribe when done
    await adminClient.unsubscribe();
  }
}

main().catch(console.error);