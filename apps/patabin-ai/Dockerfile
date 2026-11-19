FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /patabin-ai ./cmd/patabin-ai

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /patabin-ai /patabin-ai
USER nonroot:nonroot
EXPOSE 8787
ENTRYPOINT ["/patabin-ai"]
