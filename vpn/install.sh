#!/usr/bin/env bash
#
# BLACKSEAUA VPN — інсталятор сервера WireGuard
# Піднімає багатокористувацький VPN з українською IP-адресою.
#
# Запуск (від root) на чистому Ubuntu 20.04+/22.04+/24.04 або Debian 11+:
#   sudo bash install.sh
#
# Змінні можна перевизначити перед запуском, напр.:
#   sudo WG_PORT=443 WG_DNS="1.1.1.1,1.0.0.1" bash install.sh
#
set -euo pipefail

# ── Налаштування (з дефолтами) ───────────────────────────────────────────────
WG_IFACE="${WG_IFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"                 # UDP-порт. Можна поставити 443, якщо блокують.
WG_NET="${WG_NET:-10.66.66.0/24}"           # Внутрішня підмережа VPN
WG_SERVER_IP="${WG_SERVER_IP:-10.66.66.1}"  # Адреса сервера всередині VPN
WG_DNS="${WG_DNS:-1.1.1.1,1.0.0.1}"         # DNS для клієнтів
WG_DIR="/etc/wireguard"
PARAMS="${WG_DIR}/${WG_IFACE}.params"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[+]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[x]${NC} $*" >&2; }

# ── Перевірки ────────────────────────────────────────────────────────────────
if [[ "${EUID}" -ne 0 ]]; then
  error "Запусти від root: sudo bash install.sh"
  exit 1
fi

if [[ ! -e /dev/net/tun ]]; then
  error "Немає /dev/net/tun. У цього VPS/контейнера немає підтримки TUN — WireGuard не запрацює."
  error "Обери в провайдера KVM-VPS (не OpenVZ) або увімкни TUN у панелі."
  exit 1
fi

# ── Визначаємо ОС ────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS_ID="${ID:-}"
else
  error "Не вдалось визначити ОС (немає /etc/os-release)."
  exit 1
fi

case "${OS_ID}" in
  ubuntu|debian) : ;;
  *) warn "ОС '${OS_ID}' офіційно не тестована. Продовжую для Debian-подібних систем..." ;;
esac

# ── Встановлення пакетів ─────────────────────────────────────────────────────
info "Оновлюю пакети та ставлю WireGuard..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq wireguard wireguard-tools iptables qrencode curl

# ── Публічний інтерфейс та IP ────────────────────────────────────────────────
PUB_IFACE="${WG_PUB_IFACE:-$(ip -4 route list default | awk '/default/ {print $5; exit}')}"
if [[ -z "${PUB_IFACE}" ]]; then
  error "Не вдалось визначити зовнішній мережевий інтерфейс."
  exit 1
fi

PUB_IP="${WG_ENDPOINT:-}"
if [[ -z "${PUB_IP}" ]]; then
  PUB_IP="$(curl -4 -s --max-time 8 https://api.ipify.org || true)"
fi
if [[ -z "${PUB_IP}" ]]; then
  PUB_IP="$(ip -4 addr show "${PUB_IFACE}" | awk '/inet / {print $2; exit}' | cut -d/ -f1 || true)"
fi
if [[ -z "${PUB_IP}" ]]; then
  error "Не вдалось визначити публічну IP-адресу. Задай вручну: WG_ENDPOINT=1.2.3.4 bash install.sh"
  exit 1
fi

info "Зовнішній інтерфейс: ${PUB_IFACE}"
info "Публічна IP:        ${PUB_IP}"

# ── Ключі сервера ────────────────────────────────────────────────────────────
umask 077
mkdir -p "${WG_DIR}"

if [[ -f "${PARAMS}" ]]; then
  warn "Знайдено існуючу конфігурацію ${PARAMS}."
  read -r -p "Перевстановити з нуля? Усі поточні користувачі будуть видалені. [y/N] " ans
  if [[ ! "${ans}" =~ ^[Yy]$ ]]; then
    info "Скасовано. Для додавання користувачів використовуй ./wg-users.sh add <імʼя>"
    exit 0
  fi
  systemctl stop "wg-quick@${WG_IFACE}" 2>/dev/null || true
  rm -f "${WG_DIR}/${WG_IFACE}.conf" "${PARAMS}"
  rm -rf "${WG_DIR}/clients"
fi

SERVER_PRIV="$(wg genkey)"
SERVER_PUB="$(echo "${SERVER_PRIV}" | wg pubkey)"

# ── Увімкнення форвардингу ───────────────────────────────────────────────────
info "Вмикаю IP-форвардинг..."
cat > /etc/sysctl.d/99-wireguard-forward.conf <<EOF
net.ipv4.ip_forward = 1
EOF
sysctl -q --system

# ── Конфіг сервера ───────────────────────────────────────────────────────────
info "Створюю ${WG_DIR}/${WG_IFACE}.conf..."
cat > "${WG_DIR}/${WG_IFACE}.conf" <<EOF
# BLACKSEAUA VPN — конфіг сервера. НЕ редагуй вручну блоки # BEGIN_PEER / # END_PEER.
[Interface]
Address = ${WG_SERVER_IP}/${WG_NET##*/}
ListenPort = ${WG_PORT}
PrivateKey = ${SERVER_PRIV}
PostUp   = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${PUB_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${PUB_IFACE} -j MASQUERADE
EOF
chmod 600 "${WG_DIR}/${WG_IFACE}.conf"

# ── Файл параметрів для wg-users.sh ──────────────────────────────────────────
cat > "${PARAMS}" <<EOF
WG_IFACE=${WG_IFACE}
WG_PORT=${WG_PORT}
WG_NET=${WG_NET}
WG_SERVER_IP=${WG_SERVER_IP}
WG_DNS=${WG_DNS}
SERVER_PUB=${SERVER_PUB}
ENDPOINT=${PUB_IP}
EOF
chmod 600 "${PARAMS}"

mkdir -p "${WG_DIR}/clients"

# ── Запуск сервісу ───────────────────────────────────────────────────────────
info "Запускаю WireGuard..."
systemctl enable "wg-quick@${WG_IFACE}" >/dev/null 2>&1
systemctl restart "wg-quick@${WG_IFACE}"

# ── Готово ───────────────────────────────────────────────────────────────────
echo
info "VPN-сервер успішно піднято! 🎉"
echo
echo "  Endpoint (для клієнтів):  ${PUB_IP}:${WG_PORT}/udp"
echo "  Внутрішня мережа VPN:     ${WG_NET}"
echo
warn "ВАЖЛИВО: у панелі провайдера / фаєрволі відкрий UDP-порт ${WG_PORT}."
echo
echo "Далі — додай користувача (згенерує конфіг + QR-код):"
echo "    sudo ./wg-users.sh add ivan"
echo
echo "Список / видалення:"
echo "    sudo ./wg-users.sh list"
echo "    sudo ./wg-users.sh del ivan"
