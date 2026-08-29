import { WebSocketServer, WebSocket } from 'ws';
import { getLeaderboardSnapshot } from '../modules/ranking/index.js';

export interface ChannelSubscription {
  channel: string;
  lastSequenceNumber: number;
}

export class RealtimeChannelServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<{ ws: WebSocket; channels: Set<string> }> = new Set();

  public init(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws: WebSocket) => {
      const client = { ws, channels: new Set<string>() };
      this.clients.add(client);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          if (data.type === 'SUBSCRIBE') {
            const channel = data.channel;
            const clientSeq = data.last_sequence_number ?? 0;
            client.channels.add(channel);

            // Send initial snapshot + sequence number for snapshot-resume protocol
            if (channel.startsWith('leaderboard:')) {
              const eventId = channel.split(':')[1];
              const snapshot = getLeaderboardSnapshot(eventId);
              ws.send(
                JSON.stringify({
                  type: 'SNAPSHOT',
                  channel,
                  sequence_number: snapshot.sequence_number,
                  data: snapshot.rankings,
                })
              );
            }
          }
        } catch (e) {
          // ignore malformed message
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
      });
    });
  }

  public broadcastToChannel(channel: string, payload: any, sequenceNumber: number): void {
    const msg = JSON.stringify({
      type: 'EVENT',
      channel,
      sequence_number: sequenceNumber,
      payload,
    });

    for (const client of this.clients) {
      if (client.channels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  }
}

export const realtimeServer = new RealtimeChannelServer();
