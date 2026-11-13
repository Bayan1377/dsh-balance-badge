/* Balance badge — always-visible DeepSeek account balance in the sidebar footer.
 * Defensive by design: every step (slot placement, balance read, render) is
 * guarded, so a missing slot or an account call that is not ready yet can never
 * fail the client boot. Placement is retried until the sidebar slot exists. */
window.__ModuleLoader__.load({
	id: "dsh-balance-badge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");

		/** Refresh cadence; the Platform balance changes on top-up and on usage. */
		const POLL_MS = 300000;
		/** Russian copy, kept literal so no locale service is required. */
		const LABEL = "Баланс";
		const BONUS_LABEL = "Бонусный баланс";

		/**
		 * Format one wallet amount: two decimals, grouped thousands, and
		 * sub-cent amounts as <0.01.
		 */
		function formatAmount(balance, currency) {
			const symbol = currency === "CNY" ? "¥" : "$";
			const value = Number(balance);
			if (!Number.isFinite(value)) return symbol + String(balance);
			if (value === 0) return symbol + "0.00";
			const magnitude = Math.abs(value);
			if (value > 0 && magnitude < 0.01) return symbol + "<0.01";
			const cents = value > 0 ? Math.trunc(value * 100) / 100 : -Math.max(0.01, Math.round(magnitude * 100) / 100);
			const [whole, fraction] = Math.abs(cents).toFixed(2).split(".");
			const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			return (cents < 0 ? "-" : "") + symbol + grouped + "." + fraction;
		}

		/** Module-level snapshot store; the badge subscribes to it. */
		const store = {
			wallets: [],
			bonusWallets: [],
			listeners: new Set(),
			set(wallets, bonusWallets) {
				store.wallets = Array.isArray(wallets) ? wallets : [];
				store.bonusWallets = Array.isArray(bonusWallets) ? bonusWallets : [];
				for (const listener of store.listeners) {
					try {
						listener();
					} catch (error) {
						console.warn("[balance-badge] listener failed", error);
					}
				}
			},
			subscribe(fn) {
				store.listeners.add(fn);
				return () => store.listeners.delete(fn);
			}
		};

		/** Client metadata every account call carries. */
		function clientMetadata() {
			const boot = typeof window === "undefined" ? void 0 : window.__DSH_BOOT__;
			return {
				version: (boot && boot.release && boot.release.version) || "",
				locale: "ru",
				timezoneOffsetSeconds: -(/* @__PURE__ */ new Date()).getTimezoneOffset() * 60
			};
		}

		/** One guarded balance read; accepts both the wrapped and the plain result shape. */
		function readBalance(ctx) {
			try {
				const account = ctx && ctx.remote && ctx.remote.account;
				if (!account || typeof account.getBalance !== "function") return;
				Promise.resolve(account.getBalance(clientMetadata())).then((result) => {
					if (result === null || result === void 0) return;
					const value = result.ok === true ? result.value : result;
					if (!value || value.status !== "ready") return;
					store.set(value.value, value.bonusWallets);
				}).catch((error) => {
					console.warn("[balance-badge] balance read failed", error);
				});
			} catch (error) {
				console.warn("[balance-badge] balance read threw", error);
			}
		}

		/** Sidebar footer badge: the current balance beside the Settings control. */
		function BalanceBadge() {
			const [, setTick] = react.useState(0);
			react.useEffect(() => store.subscribe(() => setTick((tick) => tick + 1)), []);
			const wallets = store.wallets;
			if (!Array.isArray(wallets) || wallets.length === 0) return null;
			const text = wallets.map((wallet) => formatAmount(wallet.balance, wallet.currency)).join(" · ");
			const bonus = (store.bonusWallets || [])
				.filter((wallet) => Number(wallet.balance) > 0)
				.map((wallet) => formatAmount(wallet.balance, wallet.currency));
			const title = bonus.length > 0
				? `${LABEL}: ${text} · ${BONUS_LABEL}: ${bonus.join(" · ")}`
				: `${LABEL}: ${text}`;
			return react.createElement("span", {
				className: "dsh-balance-badge",
				"data-dsh-balance-badge": "",
				title,
				style: {
					display: "inline-flex",
					alignItems: "center",
					height: 28,
					padding: "0 8px",
					borderRadius: 999,
					fontSize: 12,
					fontVariantNumeric: "tabular-nums",
					whiteSpace: "nowrap",
					color: "var(--dsw-alias-label-secondary, currentColor)"
				}
			}, text);
		}

		/** Required services: the slot registry and the account Remote namespace. */
		const inject = ["slots", "remote", "remote.account"];

		/**
		 * Place the footer action, retrying while the sidebar slot is not declared
		 * yet (at boot the client graph can materialize this module first).
		 */
		function place(ctx, attempt = 0) {
			try {
				ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
					name: "sidebar.footer.action",
					id: "balance-badge",
					order: 10
				}, BalanceBadge));
				return true;
			} catch (error) {
				if (attempt < 20) {
					const timer = setTimeout(() => place(ctx, attempt + 1), 1000);
					if (timer && typeof timer.unref === "function") timer.unref();
				} else {
					console.warn("[balance-badge] could not place the footer action", error);
				}
				return false;
			}
		}

		/** Never throw out of apply: a failed badge must not fail the client boot. */
		function apply(ctx) {
			try {
				readBalance(ctx);
				const timer = setInterval(() => readBalance(ctx), POLL_MS);
				if (timer && typeof timer.unref === "function") timer.unref();
				if (typeof document !== "undefined") {
					document.addEventListener("visibilitychange", () => {
						if (document.visibilityState === "visible") readBalance(ctx);
					});
				}
				place(ctx);
			} catch (error) {
				console.warn("[balance-badge] apply failed", error);
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
