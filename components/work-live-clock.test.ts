import assert from "node:assert/strict";
import { test } from "node:test";
import { liveClockTasks, type LiveClockTask } from "./work-live-clock";

const tasks: LiveClockTask[] = [
  { index: 2, minute: 1, title: "稍后", status: "pending" },
  { index: 0, minute: 0, second: 30, title: "同时 A", status: "pending" },
  { index: 1, minute: 0, second: 30, title: "同时 B", status: "pending" },
  { index: 3, minute: 0, title: "已完成", status: "done" },
  { index: 4, minute: 0, title: "异常", status: "issue" },
  { index: 5, minute: 0, title: "不适用", status: "skip" },
];

test("reminders begin at the exact scheduled second and group simultaneous pending tasks", () => {
  assert.equal(liveClockTasks(tasks, 29).due.length, 0);
  assert.deepEqual(liveClockTasks(tasks, 30).due.map(task => task.index), [0, 1]);
  assert.deepEqual(liveClockTasks(tasks, 60).due.map(task => task.index), [0, 1, 2]);
});

test("next task and overdue count exclude resolved statuses", () => {
  const state = liveClockTasks(tasks, 120);
  assert.equal(state.next?.index, 0);
  assert.equal(state.due.length, 3);
  assert.equal(liveClockTasks(tasks.map(task => task.index === 0 ? { ...task, status: "done" } : task), 120).next?.index, 1);
});


test("manual host instructions never trigger time reminders", () => {
  const manual = { index: 0, minute: 0, trigger: "manual" as const, title: "按主播口令", status: "pending" as const };
  assert.deepEqual(liveClockTasks([manual], 600), { next: undefined, due: [] });
});
