package mqtt

import (
	"encoding/binary"
	"fmt"
)

// Topics
const (
	TopicMoveTo       = "srv/adam/moveto"
	TopicReset        = "srv/adam/reset"
	TopicAck          = "adam/srv/ack"
	TopicError        = "adam/srv/error"
	TopicCurrentPos   = "adam/srv/current_pos"
	TopicStatus       = "adam/srv/status"
	TopicGraphVersion = "adam/srv/graph_version"
	TopicBattery      = "adam/srv/battery"
	TopicTrash        = "adam/srv/trash"
	TopicOnline       = "adam/srv/online"
)

// Status Codes
const (
	StatusIdle     byte = 0x00
	StatusMoving   byte = 0x01
	StatusDwell    byte = 0x02
	StatusError    byte = 0x03
	StatusObstacle byte = 0x04
)

func StatusToString(s byte) string {
	switch s {
	case StatusIdle:
		return "IDLE"
	case StatusMoving:
		return "MOVING"
	case StatusDwell:
		return "DWELL"
	case StatusError:
		return "ERROR"
	case StatusObstacle:
		return "OBSTACLE"
	default:
		return fmt.Sprintf("UNKNOWN(0x%02X)", s)
	}
}

// Ack Codes
const (
	AckAccepted      byte = 0x00
	AckBusy          byte = 0x01
	AckQueueFull     byte = 0x02
	AckDuplicate     byte = 0x03
	AckInvalidTarget byte = 0x04
	AckNotReady      byte = 0x05
	AckTrashFull     byte = 0x06
)

func AckToString(a byte) string {
	switch a {
	case AckAccepted:
		return "ACCEPTED"
	case AckBusy:
		return "BUSY"
	case AckQueueFull:
		return "QUEUE_FULL"
	case AckDuplicate:
		return "DUPLICATE"
	case AckInvalidTarget:
		return "INVALID_TARGET"
	case AckNotReady:
		return "NOT_READY"
	case AckTrashFull:
		return "TRASH_FULL"
	default:
		return fmt.Sprintf("UNKNOWN(0x%02X)", a)
	}
}

// Error Codes
const (
	ErrNone          byte = 0x00
	ErrNoPath        byte = 0x01
	ErrLineLost      byte = 0x02
	ErrNodeTimeout   byte = 0x03
	ErrInvalidTarget byte = 0x04
	ErrFetchFailed   byte = 0x05
)

func ErrorToString(e byte) string {
	switch e {
	case ErrNone:
		return "NONE"
	case ErrNoPath:
		return "NO_PATH"
	case ErrLineLost:
		return "LINE_LOST"
	case ErrNodeTimeout:
		return "NODE_TIMEOUT"
	case ErrInvalidTarget:
		return "INVALID_TARGET"
	case ErrFetchFailed:
		return "FETCH_FAILED"
	default:
		return fmt.Sprintf("UNKNOWN(0x%02X)", e)
	}
}

// EncodeMoveTo creates payload [req_id: 2B LE][node: 1B ASCII]
func EncodeMoveTo(reqID uint16, node string) []byte {
	buf := make([]byte, 3)
	binary.LittleEndian.PutUint16(buf[0:2], reqID)
	if len(node) > 0 {
		buf[2] = node[0]
	}
	return buf
}

// DecodeAck parses [req_id: 2B LE][result: 1B]
func DecodeAck(payload []byte) (reqID uint16, result byte, err error) {
	if len(payload) < 3 {
		return 0, 0, fmt.Errorf("payload ack terlalu pendek: %d byte", len(payload))
	}
	reqID = binary.LittleEndian.Uint16(payload[0:2])
	result = payload[2]
	return reqID, result, nil
}

// DecodeError parses [req_id: 2B LE][code: 1B]
func DecodeError(payload []byte) (reqID uint16, code byte, err error) {
	if len(payload) < 3 {
		return 0, 0, fmt.Errorf("payload error terlalu pendek: %d byte", len(payload))
	}
	reqID = binary.LittleEndian.Uint16(payload[0:2])
	code = payload[2]
	return reqID, code, nil
}

// DecodeCurrentPos parses [current: 1B ASCII][next: 1B ASCII or 0x00]
func DecodeCurrentPos(payload []byte) (current string, next string, err error) {
	if len(payload) < 2 {
		return "", "", fmt.Errorf("payload current_pos terlalu pendek: %d byte", len(payload))
	}
	current = string(payload[0])
	if payload[1] != 0x00 {
		next = string(payload[1])
	} else {
		next = ""
	}
	return current, next, nil
}

// DecodeGraphVersion parses [version: 4B LE]
func DecodeGraphVersion(payload []byte) (uint32, error) {
	if len(payload) < 4 {
		return 0, fmt.Errorf("payload graph_version terlalu pendek: %d byte", len(payload))
	}
	return binary.LittleEndian.Uint32(payload[0:4]), nil
}

