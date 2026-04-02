module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/ailabs_config?id=eq.1&select=seats_left`,
      {
        headers: {
          'apikey': process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );
    const data = await response.json();
    res.status(200).json({ seats_left: data[0]?.seats_left ?? 8 });
  } catch (e) {
    res.status(200).json({ seats_left: 8 });
  }
};
