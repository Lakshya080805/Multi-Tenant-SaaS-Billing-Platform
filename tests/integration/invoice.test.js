import request from "supertest";
import { app } from "../setup/testApp.js";

describe("Invoice API", () => {

  test("GET /health should return OK", async () => {
    const res = await request(app).get("/health");

    expect(res.statusCode).toBe(200);
  });

});