/** Firebase Cloud Messaging v1 messages for one scam alert: one per language, each to its own topic. */
export function messagesFor(alert, region) {
  return ['fr', 'en'].map((l) => ({
    message: {
      topic: `alerts-${region}-${l}`,
      notification: { title: alert.title[l], body: alert.body[l] },
      data: { id: alert.id, route: '/scams' },
      android: { priority: 'high', notification: { channel_id: 'scam-alerts' } },
    },
  }));
}

