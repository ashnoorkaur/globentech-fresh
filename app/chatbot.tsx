import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppTheme } from '../lib/theme';

type Message = {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
};

const initialMessages: Message[] = [
  {
    id: 'assistant-welcome',
    sender: 'assistant',
    text: 'Hi. I am the GlobenTech assistant. Ask about orders, account settings, or equipment support.',
  },
];

const buildReply = (input: string) => {
  const text = input.toLowerCase();

  if (text.includes('order')) {
    return 'You can create an order from the customer dashboard and review order history from the orders screens.';
  }

  if (text.includes('account') || text.includes('profile') || text.includes('password')) {
    return 'Open Account Settings to update your profile, change your password, manage theme preference, or deactivate your account.';
  }

  if (text.includes('equipment')) {
    return 'Equipment activity is managed from dashboard actions and admin workflows. If you need a specific action, describe it.';
  }

  return 'I can help with orders, account settings, password changes, and general GlobenTech app navigation.';
};

export default function ChatbotScreen() {
  const theme = useAppTheme();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const handleSend = () => {
    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    const nextUserMessage: Message = {
      id: `${Date.now()}-user`,
      sender: 'user',
      text: trimmed,
    };

    const nextAssistantMessage: Message = {
      id: `${Date.now()}-assistant`,
      sender: 'assistant',
      text: buildReply(trimmed),
    };

    setMessages((current) => [...current, nextUserMessage, nextAssistantMessage]);
    setInput('');
  };

  return (
    <KeyboardAvoidingView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}> 
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: theme.colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text }]}>Chat</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.messagesWrap}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => {
          const isUser = message.sender === 'user';

          return (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                isUser
                  ? [styles.userBubble, { backgroundColor: theme.colors.primary }]
                  : [styles.assistantBubble, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }],
              ]}
            >
              <Text style={[styles.messageText, { color: isUser ? '#FFFFFF' : theme.colors.text }]}>{message.text}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.composer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}> 
        <TextInput
          style={[styles.input, { borderColor: theme.colors.border, backgroundColor: theme.colors.inputBg, color: theme.colors.text }]}
          value={input}
          onChangeText={setInput}
          placeholder="Ask something..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
        />
        <TouchableOpacity style={[styles.sendButton, { backgroundColor: theme.colors.primary }]} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 40,
  },
  messagesWrap: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 10,
  },
  messageBubble: {
    maxWidth: '84%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  composer: {
    borderTopWidth: 1,
    padding: 12,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 120,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sendButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
