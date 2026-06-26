// api/submit-raffle.js
// Vercel Serverless Function — PYRE Raffle Entry
// Verifies on-chain data and saves to Supabase

const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const SUPABASE_URL    = 'https://ciluzgglneghaprvbosm.supabase.co';
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY; // use service key server-side
const ALCHEMY_RPC     = process.env.ALCHEMY_RPC_URL;
const CONTRACT_ADDR   = '0x26639D1eCa23C62520ff9ff14F314481571685c9';

const ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function mintedBy(address) view returns (uint256)',
];

// Base tickets for Twitter tasks (we trust these — can't verify without Twitter API)
const TWITTER_TASKS = ['wallet', 'follow', 'like', 'rt'];
const TWITTER_TICKET_VALUE = 1;
const ONCHAIN_TICKET_VALUE = 3;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { wallet, tasks } = req.body;

    // Validate wallet
    if (!wallet || !ethers.utils.isAddress(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const walletLower = wallet.toLowerCase();

    // ── On-chain verification ─────────────────────────────────────────────
    const provider = new ethers.providers.JsonRpcProvider(ALCHEMY_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDR, ABI, provider);

    const [balance, minted] = await Promise.all([
      contract.balanceOf(wallet),
      contract.mintedBy(wallet),
    ]);

    const holdsNFT  = balance.gt(0);
    const hasMinted = minted.gt(0);

    // ── Calculate tickets ─────────────────────────────────────────────────
    let tickets = 0;
    const verifiedTasks = {};

    // Twitter tasks — self-reported (1 ticket each)
    TWITTER_TASKS.forEach(t => {
      const done = tasks?.[t] === true;
      verifiedTasks[t] = done;
      if (done) tickets += TWITTER_TICKET_VALUE;
    });

    // On-chain tasks — server verified (1 ticket per NFT, max 3 each)
    const holdTickets  = Math.min(balance.toNumber(), 3);
    const mintedTickets= Math.min(minted.toNumber(), 3);
    verifiedTasks.hold   = holdsNFT;
    verifiedTasks.minted = hasMinted;
    tickets += holdTickets + mintedTickets;

    // ── Save to Supabase ──────────────────────────────────────────────────
    const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

    const { error } = await supa.from('raffle_entries').upsert({
      wallet:       walletLower,
      tickets,
      tasks:        verifiedTasks,
      holds_nft:    holdsNFT,
      has_minted:   hasMinted,
      nft_balance:  balance.toNumber(),
      mint_count:   minted.toNumber(),
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'wallet' });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      wallet:  walletLower,
      tickets,
      tasks:   verifiedTasks,
      onchain: { holdsNFT, hasMinted, balance: balance.toNumber(), minted: minted.toNumber() },
    });

  } catch (err) {
    console.error('Raffle submit error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
