import request from "supertest";
import { app } from "../setup/testApp.js";

describe("Client API", () => {

  test("health endpoint works", async () => {
    const res = await request(app).get("/health");

    expect(res.statusCode).toBe(200);
  });

});