#!/usr/bin/env bash
#
# BLACKSEAUA VPN — керування користувачами WireGuard
#
#   sudo ./wg-users.sh add   <імʼя>   # додати користувача (конфіг + QR-код)
#   sudo ./wg-users.sh del   <імʼя>   # видалити користувача
#   sudo ./wg-users.sh list           # список користувачів
#   sudo ./wg-users.sh show  <імʼя>   # показати .conf користувача
#   sudo ./wg-users.sh qr    <імʼя>   # знову показати QR-код
#
set -euo pipefail

WG_DIR="/etc/wireguard"
IFACE="${WG_IFACE:-wg0}"
PARAMS="${WG_DIR}/${IFACE}.params"
CONF="${WG_DIR}/${IFACE}.conf"
CLIENTS_DIR="${WG_DIR}/clients"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  error "Запусти від root: sudo $0 $*"
  exit 1
fi

if [[ ! -f "${PARAMS}" ]]; then
  error "Не знайдено ${PARAMS}. Спершу запусти інсталятор: sudo bash install.sh"
  exit 1
fi

# shellcheck disable=SC1090
source "${PARAMS}"
mkdir -p "${CLIENTS_DIR}"

valid_name() { [[ "$1" =~ ^[a-zA-Z0-9_-]{1,32}$ ]]; }

apply() {
  # Застосувати зміни без розриву активних зʼєднань
  wg syncconf "${IFACE}" <(wg-quick strip "${IFACE}")
}

peer_exists() {
  grep -q "^# BEGIN_PEER $1\$" "${CONF}"
}

next_ip() {
  # Знаходимо вільну адресу у підмережі (починаємо з .2)
  local base last used candidate
  base="$(echo "${WG_SERVER_IP}" | cut -d. -f1-3)"
  mapfile -t used < <(grep -oP 'AllowedIPs = \K[0-9.]+' "${CONF}" 2>/dev/null || true)
  for last in $(seq 2 254); do
    candidate="${base}.${last}"
    if ! printf '%s\n' "${used[@]}" | grep -qx "${candidate}"; then
      echo "${candidate}"
      return 0
    fi
  done
  error "Немає вільних адрес у підмережі ${WG_NET}."
  exit 1
}

cmd_add() {
  local name="$1"
  valid_name "${name}" || { error "Некоректне імʼя. Дозволено: латиниця, цифри, - та _ (до 32 символів)."; exit 1; }
  peer_exists "${name}" && { error "Користувач '${name}' вже існує."; exit 1; }

  local priv pub psk ip client_file
  priv="$(wg genkey)"
  pub="$(echo "${priv}" | wg pubkey)"
  psk="$(wg genpsk)"
  ip="$(next_ip)"

  # Додаємо peer у конфіг сервера
  cat >> "${CONF}" <<EOF

# BEGIN_PEER ${name}
[Peer]
# ${name}
PublicKey = ${pub}
PresharedKey = ${psk}
AllowedIPs = ${ip}/32
# END_PEER ${name}
EOF

  # Клієнтський конфіг
  client_file="${CLIENTS_DIR}/${name}.conf"
  umask 077
  cat > "${client_file}" <<EOF
[Interface]
PrivateKey = ${priv}
Address = ${ip}/32
DNS = ${WG_DNS}

[Peer]
PublicKey = ${SERVER_PUB}
PresharedKey = ${psk}
Endpoint = ${ENDPOINT}:${WG_PORT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF

  apply

  info "Користувача '${name}' додано. Внутрішня IP: ${ip}"
  echo
  echo "Конфіг збережено: ${client_file}"
  echo "── QR-код (сканувати в застосунку WireGuard на телефоні) ──"
  qrencode -t ansiutf8 < "${client_file}"
  echo
  echo "Для компʼютера — передай файл ${client_file} користувачу"
  echo "та імпортуй у застосунок WireGuard."
}

cmd_del() {
  local name="$1"
  valid_name "${name}" || { error "Некоректне імʼя."; exit 1; }
  peer_exists "${name}" || { error "Користувача '${name}' не знайдено."; exit 1; }

  local pub
  pub="$(awk "/^# BEGIN_PEER ${name}\$/{f=1} f&&/^PublicKey/{print \$3; exit}" "${CONF}")"
  if [[ -n "${pub}" ]]; then
    wg set "${IFACE}" peer "${pub}" remove 2>/dev/null || true
  fi

  # Видаляємо блок peer з конфігу
  awk "/^# BEGIN_PEER ${name}\$/{f=1} !f{print} /^# END_PEER ${name}\$/{f=0}" "${CONF}" > "${CONF}.tmp"
  mv "${CONF}.tmp" "${CONF}"
  chmod 600 "${CONF}"
  rm -f "${CLIENTS_DIR}/${name}.conf"

  apply
  info "Користувача '${name}' видалено."
}

cmd_list() {
  echo "Користувачі VPN:"
  local found=0
  while IFS= read -r line; do
    local name ip
    name="${line#\# BEGIN_PEER }"
    ip="$(awk "/^# BEGIN_PEER ${name}\$/{f=1} f&&/^AllowedIPs/{print \$3; exit}" "${CONF}")"
    printf "  • %-24s %s\n" "${name}" "${ip}"
    found=1
  done < <(grep '^# BEGIN_PEER ' "${CONF}" || true)
  [[ "${found}" -eq 0 ]] && echo "  (немає — додай через: sudo $0 add <імʼя>)"
  echo
  echo "Активні зʼєднання:"
  wg show "${IFACE}" 2>/dev/null || echo "  (сервіс не запущено)"
}

cmd_show() {
  local name="$1"
  local f="${CLIENTS_DIR}/${name}.conf"
  [[ -f "${f}" ]] || { error "Конфіг '${name}' не знайдено."; exit 1; }
  cat "${f}"
}

cmd_qr() {
  local name="$1"
  local f="${CLIENTS_DIR}/${name}.conf"
  [[ -f "${f}" ]] || { error "Конфіг '${name}' не знайдено."; exit 1; }
  qrencode -t ansiutf8 < "${f}"
}

# ── Роутер команд ────────────────────────────────────────────────────────────
cmd="${1:-}"
case "${cmd}" in
  add)  [[ $# -ge 2 ]] || { error "Вкажи імʼя: $0 add <імʼя>"; exit 1; }; cmd_add "$2" ;;
  del|remove|rm) [[ $# -ge 2 ]] || { error "Вкажи імʼя: $0 del <імʼя>"; exit 1; }; cmd_del "$2" ;;
  list|ls) cmd_list ;;
  show) [[ $# -ge 2 ]] || { error "Вкажи імʼя: $0 show <імʼя>"; exit 1; }; cmd_show "$2" ;;
  qr)   [[ $# -ge 2 ]] || { error "Вкажи імʼя: $0 qr <імʼя>"; exit 1; }; cmd_qr "$2" ;;
  *)
    echo "BLACKSEAUA VPN — керування користувачами"
    echo
    echo "Використання:"
    echo "  sudo $0 add   <імʼя>   додати користувача (конфіг + QR-код)"
    echo "  sudo $0 del   <імʼя>   видалити користувача"
    echo "  sudo $0 list           список користувачів + активні зʼєднання"
    echo "  sudo $0 show  <імʼя>   показати .conf користувача"
    echo "  sudo $0 qr    <імʼя>   знову показати QR-код"
    ;;
esac
