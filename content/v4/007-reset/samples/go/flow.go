package main

import (
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// issue makes a link for one account: new token, only its hash stored.
func issue(c *pgx.Conn, userID int64, life time.Duration) string {
	token := newToken()
	run(c, `INSERT INTO reset_tokens (token_hash, user_id, expires_at)
	        VALUES ($1, $2, now() + $3::interval)`,
		hashToken(token), userID, fmt.Sprintf("%d milliseconds", life.Milliseconds()))
	return token
}

// redeem uses a token. It returns whose it was; the form never says who.
func redeem(c *pgx.Conn, token, newPassword string) bool {
	var userID int64
	err := c.QueryRow(ctx, useToken, hashToken(token)).Scan(&userID)
	if noRows(err) {
		return false // unknown, used or expired: all look the same
	}
	if err != nil {
		panic(err)
	}
	run(c, "UPDATE users SET password = $1 WHERE id = $2", newPassword, userID)
	run(c, endSessions, userID)
	return true
}

// The version most of us write first: look, then write.
func redeemCheckFirst(c *pgx.Conn, token, newPassword string) bool {
	var userID int64
	err := c.QueryRow(ctx, `SELECT user_id FROM reset_tokens
	    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
		hashToken(token)).Scan(&userID)
	if noRows(err) {
		return false
	}
	if err != nil {
		panic(err)
	}
	run(c, "UPDATE reset_tokens SET used_at = now() WHERE token_hash = $1",
		hashToken(token))
	run(c, "UPDATE users SET password = $1 WHERE id = $2", newPassword, userID)
	return true
}
