set -eu

url_decode() {
  escaped=$(printf '%s' "$1" | sed 's/%/\\x/g')
  printf '%b' "$escaped"
}

database_url="${DATABASE_URL:?set DATABASE_URL}"

case "$database_url" in
  postgres://* | postgresql://*) ;;
  *)
    echo "DATABASE_URL must start with postgres:// or postgresql://" >&2
    exit 1
    ;;
esac

without_scheme="${database_url#*://}"

case "$without_scheme" in
  *@*/*) ;;
  *)
    echo "DATABASE_URL must include user, password, host, and database" >&2
    exit 1
    ;;
esac

userinfo="${without_scheme%%@*}"
after_at="${without_scheme#*@}"

case "$userinfo" in
  *:*) ;;
  *)
    echo "DATABASE_URL must include both user and password" >&2
    exit 1
    ;;
esac

user_enc="${userinfo%%:*}"
password_enc="${userinfo#*:}"
path="${after_at#*/}"
database_enc="${path%%\?*}"
database_enc="${database_enc%%#*}"

if [ -z "$user_enc" ] || [ -z "$password_enc" ] || [ -z "$database_enc" ]; then
  echo "DATABASE_URL must include non-empty user, password, and database" >&2
  exit 1
fi

export POSTGRES_USER="$(url_decode "$user_enc")"
export POSTGRES_PASSWORD="$(url_decode "$password_enc")"
export POSTGRES_DB="$(url_decode "$database_enc")"

exec docker-entrypoint.sh "$@"
