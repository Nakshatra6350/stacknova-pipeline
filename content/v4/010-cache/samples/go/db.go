package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ctx = context.Background()

// A product's rating, as the product page shows it.
type Summary struct {
	Reviews int64
	Stars   float64
}

// connect opens a pool of 20 connections, like one app server would.
func connect() *pgxpool.Pool {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://demo@localhost:55432/cache?sslmode=disable"
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		log.Fatal(err)
	}
	cfg.MaxConns = 20
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	return p
}

func run(p *pgxpool.Pool, sql string) {
	if _, err := p.Exec(ctx, sql); err != nil {
		log.Fatalf("%v\n%s", err, sql)
	}
}

// The query the cache protects: count and average every review of a product.
const ratingSQL = `
SELECT count(*), coalesce(avg(stars), 0)
FROM reviews WHERE product_id = $1`

// rating loads a product's rating from the database. Each call is one query.
func rating(p *pgxpool.Pool, product int) Load {
	return func() (Summary, error) {
		var s Summary
		err := p.QueryRow(ctx, ratingSQL, product).Scan(&s.Reviews, &s.Stars)
		return s, err
	}
}

// load makes 2,000,000 reviews: 1,000,000 for one best-selling product,
// and 1,000 each for 1,000 others.
func load(p *pgxpool.Pool) {
	run(p, "DROP TABLE IF EXISTS reviews")
	run(p, `CREATE TABLE reviews (
	  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	  product_id int NOT NULL,
	  stars      int NOT NULL CHECK (stars BETWEEN 1 AND 5)
	)`)
	t := time.Now()
	run(p, `INSERT INTO reviews (product_id, stars)
	  SELECT 1, 1 + (abs(hashtext(g::text)) % 100 >= 5)::int
	           + (abs(hashtext(g::text)) % 100 >= 10)::int
	           + (abs(hashtext(g::text)) % 100 >= 20)::int
	           + (abs(hashtext(g::text)) % 100 >= 45)::int
	  FROM generate_series(1, 1000000) g`)
	run(p, `INSERT INTO reviews (product_id, stars)
	  SELECT 2 + g % 1000, 1 + abs(hashtext(g::text)) % 5
	  FROM generate_series(1, 1000000) g`)
	run(p, "CREATE INDEX reviews_product ON reviews (product_id, stars)")
	run(p, "VACUUM ANALYZE reviews")
	log.Printf("2,000,000 reviews loaded and indexed in %.1f s",
		time.Since(t).Seconds())
}
