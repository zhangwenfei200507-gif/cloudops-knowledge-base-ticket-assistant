export async function createSupportTicket(ticket) {
  const token = localStorage.getItem('aegiscloud_token');
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 1) {
    throw new Error(payload?.message || 'Ticket creation could not be confirmed. Contact support if you are unsure whether it was sent.');
  }
}
