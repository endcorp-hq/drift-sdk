import dotenv from 'dotenv';
import {
    AdminClient,
    Wallet,
    PublicKey,
    BulkAccountLoader,
    DriftEnv,
    getDriftStateAccountPublicKey,
    StateAccount
} from '@drift-labs/sdk';
import { Keypair, Connection, clusterApiUrl } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Load environment variables from .env file in the 'updateAdmin' directory
const envPath = path.resolve(__dirname, '../.env'); // Expect .env in the updateAdmin folder
const dotenvResult = dotenv.config({ path: envPath });

if (dotenvResult.error) {
    console.warn(`Error loading .env file from ${envPath}:`, dotenvResult.error);
} else {
    console.log(`.env file loaded successfully from ${envPath}`);
    if (dotenvResult.parsed) {
        console.log('Variables loaded from .env:', Object.keys(dotenvResult.parsed));
    }
}

// Function to load Keypair from a file path
function loadKeypairFromFile(filePath: string): Keypair {
    const fullPath = path.resolve(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Keypair file not found at ${fullPath}`);
    }
    const secretKeyString = fs.readFileSync(fullPath, { encoding: 'utf8' });
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
}

async function main() {
    const rpcUrl = process.env.RPC_URL || clusterApiUrl('devnet');
    console.log(`Using RPC URL: ${rpcUrl}`);
    const connection = new Connection(rpcUrl, { commitment: 'confirmed' });

    // Log the value of ADMIN_PRIVATE_KEY_PATH before checking it
    console.log(`Attempting to read ADMIN_PRIVATE_KEY_PATH: '${process.env.ADMIN_PRIVATE_KEY_PATH}'`);

    const adminKeypairPath = process.env.ADMIN_PRIVATE_KEY_PATH;
    if (!adminKeypairPath) {
        console.error('Detailed check: ADMIN_PRIVATE_KEY_PATH is not set or is an empty string.');
        throw new Error(
            'ADMIN_PRIVATE_KEY_PATH environment variable not set. This must be the keypair of the CURRENT admin.'
        );
    }
    console.log(`Loading current admin keypair from: ${adminKeypairPath}`);
    const currentAdminKeypair = loadKeypairFromFile(adminKeypairPath);
    const adminWallet = new Wallet(currentAdminKeypair);
    console.log(
        'Using current admin wallet. Public Key:',
        adminWallet.publicKey.toBase58()
    );

    const driftProgramIdStr = process.env.DRIFT_PROGRAM_ID;
    if (!driftProgramIdStr) {
        throw new Error('DRIFT_PROGRAM_ID environment variable not set.');
    }
    const driftProgramId = new PublicKey(driftProgramIdStr);
    console.log(`Using Drift program ID: ${driftProgramId.toBase58()}`);

    const newAdminPublicKeyStr = process.env.NEW_ADMIN_PUBLIC_KEY;
    if (!newAdminPublicKeyStr) {
        throw new Error('NEW_ADMIN_PUBLIC_KEY environment variable not set.');
    }
    const newAdminPublicKey = new PublicKey(newAdminPublicKeyStr);
    console.log(
        `Attempting to update program admin to: ${newAdminPublicKey.toBase58()}`
    );

    const bulkAccountLoader = new BulkAccountLoader(
        connection,
        'confirmed',
        1000 // Milliseconds
    );

    const adminClient = new AdminClient({
        connection,
        wallet: adminWallet,
        programID: driftProgramId,
        env: (process.env.DRIFT_ENV as DriftEnv) || 'devnet', // Ensure env is correctly typed
        opts: {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
        },
        accountSubscription: {
            type: 'polling',
            accountLoader: bulkAccountLoader,
        },
    });

    try {
        console.log('Subscribing AdminClient...');
        await adminClient.subscribe();
        console.log('AdminClient subscribed.');

        const statePublicKey = await getDriftStateAccountPublicKey(driftProgramId);
        const stateAccount = (await adminClient.program.account.state.fetch(
            statePublicKey
        )) as StateAccount;

        if (!stateAccount) {
            throw new Error('Could not fetch state account.');
        }
        console.log(
            `Current program admin from chain is: ${stateAccount.admin.toBase58()}`
        );

        if (!stateAccount.admin.equals(adminWallet.publicKey)) {
            console.warn(
                `WARNING: The public key of the loaded ADMIN_PRIVATE_KEY_PATH (${adminWallet.publicKey.toBase58()}) does not match the current program admin (${stateAccount.admin.toBase58()}). This transaction will likely fail.`
            );
            // Optional: throw an error or ask for confirmation before proceeding
            // throw new Error("Current admin keypair does not match program admin.");
        }

        console.log(`Updating admin to ${newAdminPublicKey.toBase58()}...`);
        const txSig = await adminClient.updateAdmin(newAdminPublicKey);

        console.log('Update admin transaction sent. Signature:', txSig);
        console.log(
            `Waiting for transaction confirmation... (View on Solana Explorer: https://explorer.solana.com/tx/${txSig}?cluster=${process.env.DRIFT_ENV || 'devnet'})`
        );

        const latestBlockHash = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
            {
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                signature: txSig,
            },
            'confirmed'
        );
        console.log('Transaction confirmed.');

        // Verify the change
        console.log('Verifying admin change...');
        await adminClient.fetchAccounts(); // Re-fetch accounts or specifically the state account
        const newStateAccount = (await adminClient.program.account.state.fetch(
            statePublicKey
        )) as StateAccount;

        if (newStateAccount && newStateAccount.admin.equals(newAdminPublicKey)) {
            console.log(
                `Successfully updated admin to: ${newStateAccount.admin.toBase58()}`
            );
        } else {
            console.error(
                `Failed to verify admin update. Current admin in state is: ${
                    newStateAccount?.admin.toBase58() || 'unknown'
                }`
            );
        }
    } catch (error: any) {
        console.error('Error updating admin:', error);
        if (error && typeof error === 'object' && 'logs' in error && Array.isArray(error.logs)) {
            console.error('Transaction Logs:');
            error.logs.forEach((log: string) => console.log(log));
        }
    } finally {
        console.log('Unsubscribing AdminClient...');
        await adminClient.unsubscribe();
        console.log('AdminClient unsubscribed.');
    }
}

main().catch((err) => {
    console.error('Unhandled error in main:', err);
    process.exit(1);
}); 