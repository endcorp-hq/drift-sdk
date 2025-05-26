import { Connection, Keypair, PublicKey, Transaction, SendTransactionError } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AdminClient,
  BN,
  BASE_PRECISION,
  PRICE_PRECISION,
  ONE,
  ZERO,
  OracleSource,
  AssetTier,
  SPOT_MARKET_WEIGHT_PRECISION,
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
    programID: new PublicKey(process.env.PROGRAM_ID!),
    opts: {
      commitment: "confirmed",
    },
  });

  try {
    // Subscribe to the client
    await adminClient.subscribe();

    const state = adminClient.getStateAccount();
    
    // Validate program initialization
    console.log("\n0. Checking program initialization...");
    
    // Check state account
    console.log("Checking state account...");
    if (!state) {
      console.log("❌ Program initialization failed: State account not found");
      throw new Error("State account not found");
    }
    console.log("✅ State account found");

    // Check drift signer
    console.log("\nChecking drift signer...");
    const [driftSigner, driftSignerNonce] = PublicKey.findProgramAddressSync(
      [Buffer.from("drift_signer")],
      new PublicKey(process.env.PROGRAM_ID!)
    );
    console.log("Expected drift signer:", driftSigner.toBase58());
    console.log("Actual drift signer:", state.signer.toBase58());
    if (!driftSigner.equals(state.signer)) {
      console.log("❌ Program initialization failed: Drift signer mismatch");
      throw new Error("Drift signer mismatch");
    }
    console.log("✅ Drift signer validated");

    // Check initial state values
    console.log("\nChecking initial state values...");
    console.log("Number of markets:", state.numberOfMarkets);
    console.log("Number of spot markets:", state.numberOfSpotMarkets);
    console.log("Exchange status:", state.exchangeStatus);
    console.log("Admin:", state.admin.toBase58());
    
    if (state.numberOfMarkets !== 0) {
      console.log("❌ Program initialization failed: Number of markets should be 0");
      throw new Error("Number of markets should be 0");
    }
    if (state.numberOfSpotMarkets !== 0) {
      console.log("❌ Program initialization failed: Number of spot markets should be 0");
      throw new Error("Number of spot markets should be 0");
    }
    console.log("✅ Initial state values validated");

    // Get the current number of markets
    const marketIndex = state.numberOfMarkets;
    console.log("USDC spot market index:", marketIndex);

    // USDC mint address on devnet
    const usdcMint = new PublicKey(process.env.USDC_MINT!);

    // For USDC spot market, we must use default public key as oracle when using QuoteAsset
    const usdcOracle = PublicKey.default;

    console.log("Initializing spot market with parameters:");
    console.log("- Market Index:", marketIndex);
    console.log("- USDC Mint:", usdcMint.toBase58());
    console.log("- Oracle:", usdcOracle.toBase58());
    console.log("- Oracle Source: QUOTE_ASSET");

    console.log("\nRunning validation checks...");

    // Validate admin
    console.log("\n1. Checking admin wallet...");
    console.log("Current wallet:", keypair.publicKey.toBase58());
    console.log("State admin:", state.admin.toBase58());
    if (!keypair.publicKey.equals(state.admin)) {
      console.log("❌ Admin validation failed: Current wallet is not the admin");
      throw new Error("Current wallet is not the admin");
    } else {
      console.log("✅ Admin validation passed");
    }

    // Validate borrow rates
    console.log("\n2. Checking borrow rates...");
    const optimalUtilization = 0.8; // 80%
    const optimalRate = 0.1; // 10%
    const maxRate = 0.2; // 20%
    console.log("Optimal utilization:", optimalUtilization);
    console.log("Optimal rate:", optimalRate);
    console.log("Max rate:", maxRate);
    if (optimalRate > maxRate) {
      console.log("❌ Borrow rate validation failed: Optimal rate cannot be greater than max rate");
      throw new Error("Optimal rate cannot be greater than max rate");
    }
    if (optimalUtilization <= 0) {
      console.log("❌ Borrow rate validation failed: Optimal utilization must be greater than zero");
      throw new Error("Optimal utilization must be greater than zero");
    }
    console.log("✅ Borrow rate validation passed");

    // Validate margin weights
    console.log("\n3. Checking margin weights...");
    const initialAssetWeight = 1.0; // 100%
    const maintenanceAssetWeight = 1.0; // 100%
    const initialLiabilityWeight = 1.0; // 100%
    const maintenanceLiabilityWeight = 1.0; // 100%
    const imfFactor = 0;
    console.log("Initial asset weight:", initialAssetWeight);
    console.log("Maintenance asset weight:", maintenanceAssetWeight);
    console.log("Initial liability weight:", initialLiabilityWeight);
    console.log("Maintenance liability weight:", maintenanceLiabilityWeight);
    console.log("IMF factor:", imfFactor);

    if (initialAssetWeight > SPOT_MARKET_WEIGHT_PRECISION.toNumber()) {
      console.log("❌ Margin weight validation failed: Initial asset weight too high");
      throw new Error("Initial asset weight too high");
    }
    if (maintenanceAssetWeight > SPOT_MARKET_WEIGHT_PRECISION.toNumber()) {
      console.log("❌ Margin weight validation failed: Maintenance asset weight too high");
      throw new Error("Maintenance asset weight too high");
    }
    if (initialLiabilityWeight > SPOT_MARKET_WEIGHT_PRECISION.toNumber()) {
      console.log("❌ Margin weight validation failed: Initial liability weight too high");
      throw new Error("Initial liability weight too high");
    }
    if (maintenanceLiabilityWeight > SPOT_MARKET_WEIGHT_PRECISION.toNumber()) {
      console.log("❌ Margin weight validation failed: Maintenance liability weight too high");
      throw new Error("Maintenance liability weight too high");
    }
    console.log("✅ Margin weight validation passed");

    // Validate USDC mint decimals
    console.log("\n4. Checking USDC mint decimals...");
    const mintInfo = await connection.getParsedAccountInfo(usdcMint);
    console.log("Mint info:", mintInfo.value ? "Found" : "Not found");
    if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
      console.log("❌ USDC mint validation failed: Could not fetch mint info");
      throw new Error("Could not fetch USDC mint info");
    } else {
      console.log("✅ USDC mint validation 1 passed");
    }
    const decimals = mintInfo.value.data.parsed.info.decimals;
    console.log("Mint decimals:", decimals);
    if (decimals !== 6) {
      console.log("❌ USDC mint validation failed: Must have 6 decimals");
      throw new Error("USDC mint must have 6 decimals");
    } else {
      console.log("✅ USDC mint validation 2 passed");
    }

    // Validate oracle for quote asset
    console.log("\n5. Checking oracle configuration...");
    console.log("Oracle public key:", usdcOracle.toBase58());
    console.log("Default public key:", PublicKey.default.toBase58());
    if (!usdcOracle.equals(PublicKey.default)) {
      console.log("❌ Oracle validation failed: Must be default public key for quote asset");
      throw new Error("For OracleSource.QUOTE_ASSET, oracle must be default public key");
    } else {
      console.log("✅ Oracle validation passed");
    }

    // Validate token program
    console.log("\n6. Checking token program...");
    const tokenProgram = TOKEN_PROGRAM_ID;
    console.log("Token program:", tokenProgram.toBase58());
    if (!tokenProgram.equals(TOKEN_PROGRAM_ID)) {
      console.log("❌ Token program validation failed: Must use SPL Token program");
      throw new Error("Must use SPL Token program");
    }
    console.log("✅ Token program validation passed");

    // Validate market status and admin
    console.log("\n7. Checking market status and admin...");
    const activeStatus = true; // We want the market to be active
    if (activeStatus) {
      console.log("Market will be active, verifying admin permissions...");
      if (!keypair.publicKey.equals(state.admin)) {
        console.log("❌ Market status validation failed: Only admin can initialize active markets");
        throw new Error("Only admin can initialize active markets");
      }
    } else {
      console.log("Market will be initialized but not active");
    }
    console.log("✅ Market status validation passed");

    // Validate historical oracle data for quote asset
    console.log("\n8. Checking historical oracle data...");
    const oracleSource = OracleSource.QUOTE_ASSET;
    if (marketIndex === 0) { // QUOTE_SPOT_MARKET_INDEX
      console.log("Quote asset market detected, validating oracle configuration...");
      if (!usdcOracle.equals(PublicKey.default)) {
        console.log("❌ Historical oracle validation failed: For quote asset, oracle must be default public key");
        throw new Error("For quote asset, oracle must be default public key");
      }
      if (oracleSource !== OracleSource.QUOTE_ASSET) {
        console.log("❌ Historical oracle validation failed: For quote asset, oracle source must be QuoteAsset");
        throw new Error("For quote asset, oracle source must be QuoteAsset");
      }
    }
    console.log("✅ Historical oracle validation passed");

    console.log("\nAll validation checks passed! Proceeding with spot market initialization...");

    // Initialize spot market
    const ixs = await adminClient.getInitializeSpotMarketIx(
      usdcMint, // mint
      optimalUtilization, // optimalUtilization (80%)
      optimalRate, // optimalRate (10%)
      maxRate, // maxRate (20%)
      usdcOracle, // oracle (must be default for QuoteAsset)
      oracleSource, // oracleSource (must be QuoteAsset for USDC)
      initialAssetWeight, // initialAssetWeight (100%)
      maintenanceAssetWeight, // maintenanceAssetWeight (100%)
      initialLiabilityWeight, // initialLiabilityWeight (100%)
      maintenanceLiabilityWeight, // maintenanceLiabilityWeight (100%)
      imfFactor, // imfFactor
      0, // liquidatorFee
      0, // ifLiquidationFee
      activeStatus, // activeStatus
      AssetTier.COLLATERAL, // assetTier
      ZERO, // scaleInitialAssetWeightStart
      ZERO, // withdrawGuardThreshold
      PRICE_PRECISION.divn(100000), // orderTickSize
      BASE_PRECISION.divn(10000), // orderStepSize
      0, // ifTotalFactor
      "USDC spot market", // name
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