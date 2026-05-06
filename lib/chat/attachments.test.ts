import { describe, it, expect } from "vitest";
import { openDb } from "../db";
import { saveMessage } from "./repo";
import {
  saveAttachment,
  listAttachmentsForMessage,
  listAttachmentsForMessages,
} from "./attachments";

function setup() {
  const db = openDb(":memory:");
  db.prepare(
    "INSERT INTO users (email, password_hash) VALUES ('a@b.com','x')",
  ).run();
  db.prepare(
    "INSERT INTO modules (id, title, ord) VALUES ('m1','M1', 1)",
  ).run();
  db.prepare(
    "INSERT INTO problems (id, module_id, title, type, ord) VALUES ('p1','m1','P1','computational',1)",
  ).run();
  return db;
}

describe("attachments repo", () => {
  it("saves and lists attachments for a message", () => {
    const db = setup();
    const msg = saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "socratic",
      role: "user",
      content: "see attached",
    });
    const a = saveAttachment(db, {
      messageId: msg.id,
      mime: "image/png",
      dataBase64: "AAAA",
    });
    expect(a.id).toBeGreaterThan(0);
    const list = listAttachmentsForMessage(db, msg.id);
    expect(list.length).toBe(1);
    expect(list[0].mime).toBe("image/png");
    expect(list[0].data_base64).toBe("AAAA");
  });

  it("groups attachments across messages", () => {
    const db = setup();
    const m1 = saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "socratic",
      role: "user",
      content: "a",
    });
    const m2 = saveMessage(db, {
      userId: 1,
      problemId: "p1",
      mode: "socratic",
      role: "user",
      content: "b",
    });
    saveAttachment(db, { messageId: m1.id, mime: "image/png", dataBase64: "X" });
    saveAttachment(db, { messageId: m1.id, mime: "image/jpeg", dataBase64: "Y" });
    saveAttachment(db, { messageId: m2.id, mime: "image/webp", dataBase64: "Z" });
    const grouped = listAttachmentsForMessages(db, [m1.id, m2.id]);
    expect(grouped.get(m1.id)?.length).toBe(2);
    expect(grouped.get(m2.id)?.length).toBe(1);
  });

  it("returns an empty map for no ids", () => {
    const db = setup();
    expect(listAttachmentsForMessages(db, []).size).toBe(0);
  });
});
