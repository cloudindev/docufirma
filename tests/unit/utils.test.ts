import { cn, formatBytes, fullName, initials } from "@/lib/utils";

describe("utils", () => {
  it("merges tailwind classes, last one wins", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });

  it("builds initials and full names", () => {
    expect(initials("Ana", "García")).toBe("AG");
    expect(initials(null, null)).toBe("?");
    expect(fullName("Ana", "García")).toBe("Ana García");
    expect(fullName("Ana", null)).toBe("Ana");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
