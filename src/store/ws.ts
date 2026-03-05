import { useEffect, useRef, useLayoutEffect } from 'react';
import type { WsClientMessage, WsServerMessage } from '../lib/types';

type WsListener = (msg: WsServerMessage) => void;

class WsClient {
	private ws: WebSocket | null = null;
	private listeners = new Set<WsListener>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private currentPageId: string | null = null;
	private userId: string | null = null;

	connect(userId: string) {
		this.userId = userId;
		if (this.ws?.readyState === WebSocket.OPEN) return;
		this.doConnect();
	}

	private doConnect() {
		const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
		this.ws = new WebSocket(`${proto}//${location.host}/ws`);

		this.ws.onopen = () => {
			if (this.currentPageId && this.userId) {
				this.send({
					type: 'hello',
					pageId: this.currentPageId,
					userId: this.userId,
				});
			}
			this.startHeartbeat();
		};

		this.ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data as string) as WsServerMessage;
				for (const l of this.listeners) l(msg);
			} catch (err: unknown) {
				console.error('WebSocket message parse error:', err);
			}
		};

		this.ws.onclose = () => {
			this.stopHeartbeat();
			// Reconnect after 3s
			this.reconnectTimer = setTimeout(() => {
				this.doConnect();
			}, 3000);
		};

		this.ws.onerror = () => {
			this.ws?.close();
		};
	}

	send(msg: WsClientMessage) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	joinPage(pageId: string) {
		if (this.currentPageId === pageId) return;
		this.currentPageId = pageId;
		if (this.userId) {
			this.send({ type: 'hello', pageId, userId: this.userId });
		}
	}

	startEditing(pageId: string) {
		this.send({ type: 'editing_start', pageId });
	}

	stopEditing(pageId: string) {
		this.send({ type: 'editing_stop', pageId });
	}

	addListener(fn: WsListener) {
		this.listeners.add(fn);
	}

	removeListener(fn: WsListener) {
		this.listeners.delete(fn);
	}

	private startHeartbeat() {
		this.stopHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			this.send({ type: 'heartbeat' });
		}, 30_000);
	}

	private stopHeartbeat() {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	disconnect() {
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		this.stopHeartbeat();
		this.ws?.close();
	}
}

// Singleton
export const wsClient = new WsClient();

export function useWsListener(handler: WsListener) {
	const handlerRef = useRef(handler);

	useLayoutEffect(() => {
		handlerRef.current = handler;
	});

	useEffect(() => {
		const fn: WsListener = (msg) => {
			handlerRef.current(msg);
		};
		wsClient.addListener(fn);
		return () => {
			wsClient.removeListener(fn);
		};
	}, []);
}
