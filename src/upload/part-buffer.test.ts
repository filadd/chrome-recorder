import { describe, expect, it } from "vitest";

import { createPartBuffer } from "./part-buffer";

const blob = (size: number) => new Blob([new Uint8Array(size)]);

describe("createPartBuffer", () => {
  it("buffers below the part size", () => {
    const buffer = createPartBuffer(10);

    expect(buffer.append(blob(4))).toBe(null);
    expect(buffer.append(blob(4))).toBe(null);
    expect(buffer.bufferedBytes).toBe(8);
  });

  it("cuts a part once the floor is crossed", () => {
    const buffer = createPartBuffer(10);

    buffer.append(blob(6));
    const part = buffer.append(blob(6));

    expect(part).not.toBe(null);
    expect(part!.partNumber).toBe(1);
    expect(part!.blob.size).toBe(12);
    expect(buffer.bufferedBytes).toBe(0);
  });

  it("numbers parts consecutively from 1", () => {
    const buffer = createPartBuffer(5);

    const first = buffer.append(blob(5));
    const second = buffer.append(blob(5));
    buffer.append(blob(2));
    const final = buffer.flushFinal();

    expect(first!.partNumber).toBe(1);
    expect(second!.partNumber).toBe(2);
    expect(final!.partNumber).toBe(3);
    expect(final!.blob.size).toBe(2);
  });

  it("returns null when flushing an empty buffer", () => {
    const buffer = createPartBuffer(5);

    buffer.append(blob(5));
    expect(buffer.flushFinal()).toBe(null);
  });

  it("preserves the byte stream across cuts", async () => {
    const buffer = createPartBuffer(4);

    const partA = buffer.append(new Blob([new Uint8Array([1, 2]), new Uint8Array([3, 4])]));
    buffer.append(new Blob([new Uint8Array([5])]));
    const partB = buffer.flushFinal();

    const bytes = new Uint8Array(
      await new Blob([partA!.blob, partB!.blob]).arrayBuffer(),
    );

    expect([...bytes]).toEqual([1, 2, 3, 4, 5]);
  });
});
