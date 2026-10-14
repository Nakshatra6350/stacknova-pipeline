package payments

import (
	"context"
	"io"
	"net/http"
)

// Charger is all the naive handler asks of the payment gateway.
type Charger interface {
	Charge(ctx context.Context, body []byte) (resp []byte, err error)
}

// NaiveServer is the create-payment handler most of us write first. Nothing in it asks
// whether this payment was already made, so every request it receives charges the card.
// Shown in segment s04 of episode 001.
type NaiveServer struct {
	Gateway Charger
}

func (s *NaiveServer) Pay(w http.ResponseWriter,
	r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	resp, err := s.Gateway.Charge(r.Context(), body)
	if err != nil {
		http.Error(w, "try again", http.StatusBadGateway)
		return
	}
	w.Write(resp)
}
