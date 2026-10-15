"""Lining up what was heard with what was meant: real misses, and differences that are not."""

import pytest

from channel_os.voice.listen import Miss, missed, weight, words

TERMS = ["idempotency", "idempotent", "Idempotency-Key", "Wi-Fi"]


def test_words_are_compared_the_way_a_recogniser_writes_them() -> None:
    assert words("Add a hundred dollars; that's twenty-four at-least-once.") == words(
        "add $100 that is 24 at least once")
    assert words("Three cases. One: five hundred.") == ["3", "cases", "1", "500"]
    # A typographic apostrophe is the same apostrophe.
    curly = "You" + chr(0x2019) + "ll see it's the client's."
    assert words(curly) == ["you", "will", "see", "it", "is", "the", "client's"]
    # "Four oh nine" is how 409 is read aloud, and "dollars" is not compared: a recogniser
    # writes "$200" whether or not the word was said.
    assert words("a four oh nine conflict") == ["a", "409", "conflict"]
    assert words("you've added two hundred") == words("you have added $200")
    # Thousands are written with a comma: "50,000 requests" for "fifty thousand requests".
    assert words("fifty thousand requests") == words("50,000 requests") == ["50000", "requests"]
    assert words("a thousand machines") == words("1,000 machines") == ["1000", "machines"]
    # Hundreds and what follows them are one number: "two hundred and forty-three" is 243.
    assert words("two hundred and forty-three times") == words("243 times") == ["243", "times"]
    assert words("a hundred forty-seven") == ["147"]
    assert words("a hundred and the rest") == ["100", "and", "the", "rest"]


def test_a_status_code_read_aloud_is_no_miss() -> None:
    # "429" is said "four twenty nine" (config/pronunciation.yaml); a recogniser may write it
    # either way.
    assert missed("Reply with 429, Too Many Requests.", "reply with four twenty nine too many "
                  "requests") == []


def test_the_same_words_are_no_miss() -> None:
    text = "Retries are guaranteed. HTTP defines GET, PUT and DELETE as idempotent."
    heard = "retries are guaranteed, HTTP defines get, put and delete as idempotent"
    assert missed(text, heard) == []


# Each of these was heard in the first narration of episode 001 on 13 October 2026.
@pytest.mark.parametrize(
    ("meant", "heard", "misses"),
    [
        ("To the client, the retry looks exactly like a first attempt.",
         "To the client, the re tree looks exactly like a first attempt.",
         [Miss("retry", "re tree")]),
        ("long enough to cover realistic retries.", "long enough to cover realistic retrieves.",
         [Miss("retries", "retrieves")]),
        ("HTTP already defines GET, PUT and DELETE", "HTTP already defines get, cut and delete",
         [Miss("put", "cut")]),
        ("Stripe, for instance, keeps them", "Strive for in the end keeps them",
         [Miss("stripe", "strive"), Miss("instance", "in the end")]),
        ("to make the retry safe", "to make make the retry safe", [Miss("", "make")]),
    ],
    ids=["retry", "retries", "put", "garbled", "said-twice"],
)
def test_a_word_said_wrong_is_a_miss(meant: str, heard: str, misses: list[Miss]) -> None:
    assert missed(meant, heard) == misses


def test_a_sentence_the_voice_skipped_is_one_long_miss() -> None:
    # The voice stalled and dropped a sentence of segment s06; only a pause was left.
    meant = "Both charge. We're back to two charges, just faster. The fix is the database."
    (miss,) = missed(meant, "Both charge. The fix is the database.")
    assert miss == Miss("we are back to 2 charges just faster", "")
    assert weight([miss]) == 6


@pytest.mark.parametrize(
    ("meant", "heard"),
    [
        ("There are three possibilities.", "There are 3 possibilities."),
        ("You'll see systems advertise it.", "You will see systems advertise it."),
        ("That's called at-least-once delivery.", "That is called at least once delivery."),
        ("from Wi-Fi to mobile data", "from wifi to mobile data"),
        ("A queue redelivers a message.", "A queue re delivers a message."),
        ("You add a database write.", "You add a database right."),
        ("a dropped connection", "a drop connection"),
        ("From the client's side", "From the client side"),
        ("We look the key up.", "We looked the key up."),
        ("Clean it up at the end.", "Clean it up in the end."),
        ("add a hundred dollars to this account", "add $100 to this account"),
    ],
    ids=["digits", "contraction", "hyphens", "joined", "split", "homophone", "ending",
         "possessive", "tense", "small-word", "money"],
)
def test_what_only_the_recogniser_changed_is_no_miss(meant: str, heard: str) -> None:
    assert missed(meant, heard, TERMS) == []


def test_jargon_only_has_to_sound_close() -> None:
    meant = "That property has a name: idempotency. Send an Idempotency-Key header."
    heard = "That property has a name, item potency. Send an item potency key header."
    assert missed(meant, heard, TERMS) == []
    # Without the hint that it is jargon, a word heard differently is a miss like any other.
    assert missed(meant, heard) != []
    # And jargon said as something else entirely is still a miss.
    assert missed("an idempotent call", "an important call", TERMS) == [
        Miss("idempotent", "important")]


def test_how_bad_a_take_is() -> None:
    assert weight([]) == 0
    assert weight([Miss("retry", "re tree")]) == 2
    assert weight([Miss("retries", "retrieves"), Miss("", "make")]) == 2
    assert weight([Miss("a", "the")]) == 0
