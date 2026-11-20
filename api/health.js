export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ status: 'ok', service: 'kora', timestamp: new Date().toISOString() })
}
