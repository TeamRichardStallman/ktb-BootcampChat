import React from "react";
import PersistentAvatar from "../../common/PersistentAvatar";
import MessageContent from "./MessageContent";
import MessageActions from "./MessageActions";
import ReadStatus from "../ReadStatus";

const AIMessage = ({
  msg = {},
  isStreaming = false,
  isMine = false,
  currentUser = null,
  onReactionAdd,
  onReactionRemove,
  room = null,
  messageRef,
  socketRef,
}) => {
  const formattedTime = new Date(msg.timestamp)
    .toLocaleString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(/\./g, "년")
    .replace(/\s/g, " ")
    .replace("일 ", "일 ");

  // AI 사용자 정보 생성
  // AI 사용자 정보 생성
  const aiUser = {
    name:
      msg.aiType === "wayneAI"
        ? "Wayne AI"
        : msg.aiType === "consultingAI"
        ? "Consulting AI"
        : msg.aiType === "AIexpert"
        ? "AI 척척박사"
        : "Wayne AI", // 기본값은 'Wayne AI'
    email:
      msg.aiType === "wayneAI"
        ? "ai@wayne.ai"
        : msg.aiType === "consultingAI"
        ? "ai@consulting.ai"
        : msg.aiType === "AIexpert"
        ? "ai@aiexpert.ai"
        : "ai@wayne.ai", // 기본 이메일은 'ai@wayne.ai'
    avatarInitial:
      msg.aiType === "wayneAI"
        ? "W"
        : msg.aiType === "consultingAI"
        ? "C"
        : msg.aiType === "AIexpert"
        ? "E"
        : "W", // 기본 이니셜은 'W'
  };

  const renderContent = () => {
    if (isStreaming) {
      return (
        <>
          <MessageContent content={msg.content} />
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </>
      );
    }
    return <MessageContent content={msg.content} />;
  };

  return (
    <div className="message-group yours">
      <div className="message-sender-info">
        <PersistentAvatar user={aiUser} size="xl" showInitials={true} />
        <span className="sender-name">{aiUser.name}</span>
      </div>
      <div className="message-bubble message-ai last relative group">
        <div className="message-content">{renderContent()}</div>
        {!isStreaming && (
          <div className="message-footer">
            <div className="message-time mr-3">{formattedTime}</div>
            <ReadStatus
              messageType={msg.type}
              participants={room.participants}
              readers={msg.readers}
              messageId={msg._id}
              messageRef={messageRef}
              currentUserId={currentUser.id}
              socketRef={socketRef}
            />
          </div>
        )}
      </div>

      <MessageActions
        messageId={msg._id}
        messageContent={msg.content}
        reactions={msg.reactions}
        currentUserId={currentUser?.id}
        onReactionAdd={onReactionAdd}
        onReactionRemove={onReactionRemove}
        isMine={isMine}
        room={room}
      />
    </div>
  );
};

AIMessage.defaultProps = {
  msg: {},
  isStreaming: false,
  currentUser: null,
  onReactionAdd: () => {},
  onReactionRemove: () => {},
  room: null,
};

export default React.memo(AIMessage);
