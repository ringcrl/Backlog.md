import { describe, expect, it } from "bun:test";
import type { Task } from "../types/index.ts";
import { renderBoardTui } from "../ui/board.ts";
import { createScreen } from "../ui/tui.ts";
import { withTimeout } from "./test-utils.ts";

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: "TASK-1",
		title: "First",
		status: "To Do",
		assignee: [],
		createdDate: "2026-08-02 00:00",
		labels: [],
		dependencies: [],
		...overrides,
	};
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${message}`);
}

function hasContent(root: { content?: string; children?: unknown[] }, content: string): boolean {
	if (typeof root.content === "string" && root.content.includes(content)) return true;
	return (root.children ?? []).some((child) =>
		hasContent(child as { content?: string; children?: unknown[] }, content),
	);
}

describe("TUI task creation entrypoint", () => {
	it("opens the composer from N and focuses the created task", async () => {
		const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false });
		try {
			let composerOpened = false;
			const boardPromise = renderBoardTui(
				[task(), task({ id: "TASK-2", title: "Second", status: "Done" })],
				["To Do", "Done"],
				"horizontal",
				20,
				{
					screen,
					taskComposer: async ({ persist }) => {
						composerOpened = true;
						return persist({ title: "Created from TUI", status: "To Do" });
					},
					createTask: async () => task({ id: "TASK-3", title: "Created from TUI" }),
				},
			);
			(screen as unknown as { emit(event: string): void }).emit("key n");
			await waitUntil(() => {
				const focused = (screen as unknown as { focused?: { items?: Array<{ content?: string }>; selected?: number } })
					.focused;
				return Boolean(focused?.items?.[focused.selected ?? 0]?.content?.includes("TASK-3"));
			}, "the created task to receive focus");
			expect(composerOpened).toBe(true);

			(screen as unknown as { emit(event: string): void }).emit("key q");
			await withTimeout(boardPromise, "board close", 1000);
		} finally {
			screen.destroy();
			if (ttyDescriptor) Object.defineProperty(process.stdout, "isTTY", ttyDescriptor);
			else Reflect.deleteProperty(process.stdout, "isTTY");
		}
	});

	it("opens the archive confirmation from D before deleting a task", async () => {
		const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		const screen = createScreen({ smartCSR: false });
		try {
			const boardPromise = renderBoardTui([task()], ["To Do", "Done"], "horizontal", 20, { screen });
			(screen as unknown as { emit(event: string): void }).emit("key d");
			await waitUntil(
				() => hasContent(screen as unknown as { content?: string; children?: unknown[] }, "Archive task"),
				"the archive confirmation to open",
			);

			// Cancel to verify D never mutates a task without explicit confirmation.
			await new Promise<void>((resolve) => setImmediate(resolve));
			(screen as unknown as { focused?: { emit(event: string): void } }).focused?.emit("key n");
			await waitUntil(
				() => !hasContent(screen as unknown as { content?: string; children?: unknown[] }, "Archive task"),
				"the archive confirmation to close",
			);
			await new Promise<void>((resolve) => setImmediate(resolve));
			(screen as unknown as { emit(event: string): void }).emit("key q");
			await withTimeout(boardPromise, "board close", 1000);
		} finally {
			screen.destroy();
			if (ttyDescriptor) Object.defineProperty(process.stdout, "isTTY", ttyDescriptor);
			else Reflect.deleteProperty(process.stdout, "isTTY");
		}
	});
});
