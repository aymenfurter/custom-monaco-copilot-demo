import React, { useState, useRef, useEffect } from 'react';
import * as monaco from 'monaco-editor';
import ChatBox from './Chat/ChatBox';
import EditorInitializer from './Editor/EditorInitializer';
import XmlValidator from './Editor/XmlValidator';
import MonacoTheme from './Editor/MonacoTheme';
import CodeSuggester from './Editor/CodeSuggester';
import SyntaxHighlighter from './Editor/SyntaxHighligher';

const App = () => {
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('apiUrl') || 'https://api.openai.com/v1/chat/completions');
  const editorRef = useRef(null);

  const handleClearChat = () => {
    setMessages([]);
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const defaultContent = `<policies>
      <inbound></inbound>
      <backend></backend>
      <outbound></outbound>
      <on-error></on-error>
    </policies>`;
    const savedContent = localStorage.getItem('editorContent') || defaultContent;

    const initializer = new EditorInitializer(monaco, editorRef.current, MonacoTheme, savedContent);
    const editorInstance = initializer.initialize();

    const handleEditorChange = () => {
      const validator = new XmlValidator(editorInstance, monaco);
      const errors = validator.validate();
      setHasErrors(errors.length > 0);
      localStorage.setItem('editorContent', editorInstance.getValue());
    };

    editorInstance.onDidChangeModelContent(handleEditorChange);

    const codeSuggester = new CodeSuggester(editorInstance, apiKey, apiUrl, () => {});
    codeSuggester.register();

    const syntaxHighlighter = new SyntaxHighlighter(monaco, editorInstance);
    syntaxHighlighter.initialize();

    return () => {
      editorInstance.dispose();
      codeSuggester.dispose();
    };
  }, [apiKey]);

  const handleApiKeyChange = (event) => {
    setApiKey(event.target.value);
  };

  const handleApiKeySubmit = (event) => {
    event.preventDefault();
    localStorage.setItem('apiKey', apiKey);
    localStorage.setItem('apiUrl', apiUrl); 
  };

  const handleMessageSent = async (message) => {
    setMessages((prevMessages) => [...prevMessages, { type: 'user', text: message }]);
    setIsStreaming(true);
    setHasErrors(false);
    const currentModel = monaco.editor.getModels()[0];
    const currentCode = currentModel.getValue();

    let headers = {
      'Content-Type': 'application/json',
    };
  
    if (apiUrl !== 'https://api.openai.com/v1/chat/completions') {
      headers['api-key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are an AI assistant that helps with coding and Azure API Management policy development. Provide helpful suggestions and answers based on the code context and user messages.',
          },
          {
            role: 'user',
            content: `Here's the current code:\n\n${currentCode}\n\nUser message: ${message}`,
          },
        ],
        max_tokens: 500,
        n: 1,
        stream: true,
        temperature: 0.7,
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let botResponse = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const data = JSON.parse(line.slice(5));
          if (data.choices && data.choices.length > 0) {
            const delta = data.choices[0].delta;
            if (delta.content) {
              botResponse += delta.content;
              setMessages((prevMessages) => {
                const lastMessage = prevMessages[prevMessages.length - 1];
                if (lastMessage.type === 'bot') {
                  return [
                    ...prevMessages.slice(0, -1),
                    { type: 'bot', text: lastMessage.text + delta.content },
                  ];
                } else {
                  return [...prevMessages, { type: 'bot', text: delta.content }];
                }
              });
            }
          }
        }
      }
    }

    setIsStreaming(false);
  };

  return (
    <div className="app">
      <div className="api-key-container">
        <form onSubmit={handleApiKeySubmit}> 
          <input
            type="text"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="Enter the OpenAI API URL"
            className="api-url-input"
          />
        </form>
        <form onSubmit={handleApiKeySubmit}>
          <input
            type="password"
            value={apiKey}
            onChange={handleApiKeyChange}
            placeholder="Enter your OpenAI API key"
            className="api-key-input"
          />
          <button type="submit" className="api-key-submit">Save</button>
        </form>
      </div>
      <div className="editor-chat-container">
        <div className="editor">
          <div ref={editorRef} className="monaco-editor" style={{ height: '100%', width: '100%' }} />
        </div>
        <div className="chat">
          <ChatBox
            onMessageSent={handleMessageSent}
            messages={messages}
            isStreaming={isStreaming}
            hasErrors={hasErrors}
            onClearChat={handleClearChat}
          />
        </div>
      </div>
    </div>
  );
};

export default App;