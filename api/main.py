import os
import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="TS-SC Public API Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Vercel service binding injects the internal solver URL via SOLVER_URL
SOLVER_URL = os.environ.get("SOLVER_URL", "http://localhost:8000")


@app.get("/health")
@app.get("/api/health")
async def gateway_health():
    """Health check for gateway and upstream solver."""
    solver_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{SOLVER_URL.rstrip('/')}/health")
            if resp.status_code == 200:
                solver_status = "connected"
    except Exception:
        solver_status = "unavailable"

    return {"status": "ok", "gateway": "online", "internal_solver": solver_status}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_to_solver(request: Request, path: str):
    """Forward requests from public /api/* gateway to internal solver service."""
    # Strip any redundant 'api/' prefix passed down from routing
    clean_subpath = path
    if clean_subpath.startswith("api/"):
        clean_subpath = clean_subpath[4:]
    elif clean_subpath == "api":
        clean_subpath = ""

    target_url = f"{SOLVER_URL.rstrip('/')}/{clean_subpath.lstrip('/')}"

    async with httpx.AsyncClient(timeout=45.0) as client:
        body = await request.body()
        req_headers = {
            k: v
            for k, v in request.headers.items()
            if k.lower() not in ("host", "content-length")
        }

        response = await client.request(
            method=request.method,
            url=target_url,
            headers=req_headers,
            content=body,
            params=request.query_params,
        )

        resp_headers = {
            k: v
            for k, v in response.headers.items()
            if k.lower() not in ("content-length", "content-encoding", "transfer-encoding")
        }

        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=resp_headers,
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)

