// api/raffle-odds.js
// Returns total ticket count for odds calculation

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ciluzgglneghaprvbosm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supa
      .from('raffle_entries')
      .select('tickets');

    if (error) throw error;

    const totalTickets    = data.reduce((s, r) => s + r.tickets, 0);
    const totalParticipants = data.length;

    return res.status(200).json({ totalTickets, totalParticipants });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
